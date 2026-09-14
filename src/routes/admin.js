const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { db, UPLOADS_DIR } = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { generateAccessCode, slugifyIdentifiant } = require("../utils");

const router = express.Router();
router.use(requireAdmin);

// ---------- Upload d'images (rapports Canva, captures, etc.) ----------

const ALLOWED_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, "reports");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || "";
    cb(null, crypto.randomBytes(16).toString("hex") + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new Error("UNSUPPORTED_TYPE"));
  },
});

function humanizeUploadError(err) {
  if (err.code === "LIMIT_FILE_SIZE") return "Un des fichiers dépasse la taille maximale autorisée (15 Mo).";
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")
    return "Trop de fichiers envoyés en une fois (10 maximum).";
  if (err.message === "UNSUPPORTED_TYPE")
    return "Format de fichier non autorisé (PNG, JPG, WEBP ou PDF uniquement).";
  return "Erreur lors de l'envoi des fichiers.";
}

// Enveloppe upload.array pour transformer une erreur multer en message
// lisible plutôt qu'en page d'erreur 500 générique.
function uploadImages(req, res, next) {
  upload.array("images", 10)(req, res, (err) => {
    if (err) req.uploadError = humanizeUploadError(err);
    next();
  });
}

// ---------- Tableau de bord ----------

router.get("/", (req, res) => {
  const players = db.prepare("SELECT * FROM players ORDER BY nom, prenom").all();
  const recentReports = db
    .prepare(
      `SELECT reports.*, players.prenom, players.nom
       FROM reports JOIN players ON players.id = reports.player_id
       ORDER BY reports.created_at DESC LIMIT 10`
    )
    .all();
  const reportCount = db.prepare("SELECT COUNT(*) AS n FROM reports").get().n;
  res.render("admin/dashboard", {
    players,
    recentReports,
    reportCount,
    adminUsername: req.session.adminUsername,
  });
});

// ---------- Gestion des joueurs ----------

router.get("/joueurs", (req, res) => {
  const players = db.prepare("SELECT * FROM players ORDER BY nom, prenom").all();
  res.render("admin/joueurs", { players });
});

router.get("/joueurs/nouveau", (req, res) => {
  res.render("admin/joueur-nouveau", { error: null, values: {} });
});

router.post("/joueurs", (req, res) => {
  const { prenom, nom, poste } = req.body;
  if (!prenom || !nom) {
    return res.status(400).render("admin/joueur-nouveau", {
      error: "Le prénom et le nom sont obligatoires.",
      values: req.body,
    });
  }

  let identifiant = slugifyIdentifiant(prenom, nom);
  const exists = (id) => db.prepare("SELECT 1 FROM players WHERE identifiant = ?").get(id);
  if (exists(identifiant)) {
    let n = 2;
    while (exists(`${identifiant}${n}`)) n++;
    identifiant = `${identifiant}${n}`;
  }

  const code = generateAccessCode();
  const codeHash = bcrypt.hashSync(code, 10);

  const result = db
    .prepare(
      `INSERT INTO players (identifiant, code_hash, prenom, nom, poste, must_change_code)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run(identifiant, codeHash, prenom.trim(), nom.trim(), (poste || "").trim());

  res.render("admin/joueur-code", {
    player: { id: result.lastInsertRowid, prenom, nom, identifiant },
    code,
    reset: false,
  });
});

router.get("/joueurs/:id", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");
  const reports = db
    .prepare("SELECT * FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC")
    .all(player.id);
  res.render("admin/joueur-detail", { player, reports, error: null });
});

router.post("/joueurs/:id", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");
  const { prenom, nom, poste, actif } = req.body;
  db.prepare(
    "UPDATE players SET prenom = ?, nom = ?, poste = ?, actif = ? WHERE id = ?"
  ).run(prenom.trim(), nom.trim(), (poste || "").trim(), actif ? 1 : 0, player.id);
  res.redirect(`/admin/joueurs/${player.id}`);
});

router.post("/joueurs/:id/reinitialiser-code", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");
  const code = generateAccessCode();
  const codeHash = bcrypt.hashSync(code, 10);
  db.prepare("UPDATE players SET code_hash = ?, must_change_code = 1 WHERE id = ?").run(
    codeHash,
    player.id
  );
  res.render("admin/joueur-code", { player, code, reset: true });
});

router.post("/joueurs/:id/supprimer", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  const images = db
    .prepare(
      `SELECT report_images.* FROM report_images
       JOIN reports ON reports.id = report_images.report_id
       WHERE reports.player_id = ?`
    )
    .all(player.id);
  for (const img of images) {
    const fp = path.join(UPLOADS_DIR, "reports", img.filename);
    fs.rm(fp, { force: true }, () => {});
  }

  db.prepare("DELETE FROM players WHERE id = ?").run(player.id);
  res.redirect("/admin/joueurs");
});

// ---------- Gestion des rapports ----------

function parseStats(body) {
  const labels = [].concat(body.stat_label || []);
  const values = [].concat(body.stat_value || []);
  const stats = [];
  for (let i = 0; i < labels.length; i++) {
    if ((labels[i] || "").trim() === "") continue;
    stats.push({ label: labels[i].trim(), value: (values[i] || "").trim() });
  }
  return stats;
}

function parseVideos(body) {
  const labels = [].concat(body.video_label || []);
  const urls = [].concat(body.video_url || []);
  const videos = [];
  for (let i = 0; i < urls.length; i++) {
    if ((urls[i] || "").trim() === "") continue;
    videos.push({ label: (labels[i] || "").trim() || "Vidéo", url: urls[i].trim() });
  }
  return videos;
}

router.get("/joueurs/:id/rapports/nouveau", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");
  res.render("admin/rapport-form", { player, report: null, videos: [], stats: [], images: [], error: null });
});

router.post("/joueurs/:id/rapports", uploadImages, (req, res, next) => {
  try {
    const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
    if (!player) return res.status(404).render("404");

    const { titre, date_match, adversaire, resultat, texte } = req.body;

    if (req.uploadError || !titre || !titre.trim()) {
      return res.status(400).render("admin/rapport-form", {
        player,
        report: req.body,
        videos: parseVideos(req.body),
        stats: parseStats(req.body),
        images: [],
        error: req.uploadError || "Le titre du rapport est obligatoire.",
      });
    }

    const stats = parseStats(req.body);
    const videos = parseVideos(req.body);

    const result = db
      .prepare(
        `INSERT INTO reports (player_id, titre, date_match, adversaire, resultat, texte, stats_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        player.id,
        titre.trim(),
        date_match || null,
        (adversaire || "").trim(),
        (resultat || "").trim(),
        (texte || "").trim(),
        JSON.stringify(stats)
      );

    const reportId = result.lastInsertRowid;

    const insertVideo = db.prepare(
      "INSERT INTO report_videos (report_id, label, url, ordre) VALUES (?, ?, ?, ?)"
    );
    videos.forEach((v, i) => insertVideo.run(reportId, v.label, v.url, i));

    const insertImage = db.prepare(
      "INSERT INTO report_images (report_id, filename, original_name, ordre) VALUES (?, ?, ?, ?)"
    );
    (req.files || []).forEach((f, i) =>
      insertImage.run(reportId, f.filename, f.originalname, i)
    );

    res.redirect(`/admin/joueurs/${player.id}`);
  } catch (err) {
    next(err);
  }
});

router.get("/rapports/:id", (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!report) return res.status(404).render("404");
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(report.player_id);
  const videos = db
    .prepare("SELECT * FROM report_videos WHERE report_id = ? ORDER BY ordre")
    .all(report.id);
  const images = db
    .prepare("SELECT * FROM report_images WHERE report_id = ? ORDER BY ordre")
    .all(report.id);
  const stats = JSON.parse(report.stats_json || "[]");
  res.render("admin/rapport-form", { player, report, videos, stats, images, error: null, editing: true });
});

router.post("/rapports/:id", uploadImages, (req, res, next) => {
  try {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
    if (!report) return res.status(404).render("404");
    const player = db.prepare("SELECT * FROM players WHERE id = ?").get(report.player_id);

    const { titre, date_match, adversaire, resultat, texte } = req.body;

    if (req.uploadError || !titre || !titre.trim()) {
      const videos = db.prepare("SELECT * FROM report_videos WHERE report_id = ? ORDER BY ordre").all(report.id);
      const images = db.prepare("SELECT * FROM report_images WHERE report_id = ? ORDER BY ordre").all(report.id);
      return res.status(400).render("admin/rapport-form", {
        player,
        report: { ...report, ...req.body },
        videos: parseVideos(req.body).length ? parseVideos(req.body) : videos,
        stats: parseStats(req.body),
        images,
        error: req.uploadError || "Le titre du rapport est obligatoire.",
        editing: true,
      });
    }

    const stats = parseStats(req.body);
    const videos = parseVideos(req.body);

    db.prepare(
      `UPDATE reports SET titre = ?, date_match = ?, adversaire = ?, resultat = ?, texte = ?,
       stats_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      titre.trim(),
      date_match || null,
      (adversaire || "").trim(),
      (resultat || "").trim(),
      (texte || "").trim(),
      JSON.stringify(stats),
      report.id
    );

    db.prepare("DELETE FROM report_videos WHERE report_id = ?").run(report.id);
    const insertVideo = db.prepare(
      "INSERT INTO report_videos (report_id, label, url, ordre) VALUES (?, ?, ?, ?)"
    );
    videos.forEach((v, i) => insertVideo.run(report.id, v.label, v.url, i));

    // Suppression d'images existantes cochées
    const toDelete = [].concat(req.body.remove_image || []);
    if (toDelete.length) {
      const placeholders = toDelete.map(() => "?").join(",");
      const imgs = db
        .prepare(`SELECT * FROM report_images WHERE id IN (${placeholders}) AND report_id = ?`)
        .all(...toDelete, report.id);
      for (const img of imgs) {
        fs.rm(path.join(UPLOADS_DIR, "reports", img.filename), { force: true }, () => {});
      }
      db.prepare(`DELETE FROM report_images WHERE id IN (${placeholders}) AND report_id = ?`).run(
        ...toDelete,
        report.id
      );
    }

    const currentMax =
      db.prepare("SELECT MAX(ordre) AS m FROM report_images WHERE report_id = ?").get(report.id)
        .m || 0;
    const insertImage = db.prepare(
      "INSERT INTO report_images (report_id, filename, original_name, ordre) VALUES (?, ?, ?, ?)"
    );
    (req.files || []).forEach((f, i) =>
      insertImage.run(report.id, f.filename, f.originalname, currentMax + i + 1)
    );

    res.redirect(`/admin/joueurs/${player.id}`);
  } catch (err) {
    next(err);
  }
});

router.post("/rapports/:id/supprimer", (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!report) return res.status(404).render("404");
  const images = db.prepare("SELECT * FROM report_images WHERE report_id = ?").all(report.id);
  for (const img of images) {
    fs.rm(path.join(UPLOADS_DIR, "reports", img.filename), { force: true }, () => {});
  }
  db.prepare("DELETE FROM reports WHERE id = ?").run(report.id);
  res.redirect(`/admin/joueurs/${report.player_id}`);
});

// ---------- Changer son propre mot de passe admin ----------

router.get("/mon-compte", (req, res) => {
  res.render("admin/mon-compte", { error: null, success: null });
});

router.post("/mon-compte", (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.adminId);

  if (!bcrypt.compareSync(current_password || "", admin.password_hash)) {
    return res.render("admin/mon-compte", { error: "Mot de passe actuel incorrect.", success: null });
  }
  if (!new_password || new_password.length < 8) {
    return res.render("admin/mon-compte", {
      error: "Le nouveau mot de passe doit faire au moins 8 caractères.",
      success: null,
    });
  }
  if (new_password !== confirm_password) {
    return res.render("admin/mon-compte", { error: "Les deux mots de passe ne correspondent pas.", success: null });
  }

  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(new_password, 10),
    admin.id
  );
  res.render("admin/mon-compte", { error: null, success: "Mot de passe mis à jour." });
});

module.exports = router;
