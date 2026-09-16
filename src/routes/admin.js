const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { db, UPLOADS_DIR } = require("../db");
const { getDiskSpace } = require("../lib/disk-space");
const { requireAdmin } = require("../middleware/auth");
const {
  generateAccessCode,
  slugifyIdentifiant,
  formatDateFr,
  getEmbeddableVideo,
  enrichStatsForDisplay,
} = require("../utils");
const { buildEspaceJoueurData } = require("../lib/espace-joueur");
const { listPlayersAvecDernierRapport, getFicheJoueur } = require("../lib/joueurs");
const { buildRapportLectureSeule } = require("../lib/rapport-lecture-seule");

const router = express.Router();
router.use(requireAdmin);

// ---------- Upload de fichiers (images/PDF de rapport, vidéos, photo joueur, logo club) ----------

const ALLOWED_IMAGE_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const ALLOWED_PLAYER_MEDIA_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const ALLOWED_VIDEO_MIME = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
};

function mimeMapFor(fieldname) {
  if (fieldname === "images") return ALLOWED_IMAGE_MIME;
  if (fieldname === "video_files" || fieldname === "video_corrective_file") return ALLOWED_VIDEO_MIME;
  if (fieldname === "photo" || fieldname === "club_logo") return ALLOWED_PLAYER_MEDIA_MIME;
  return {};
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let sub = "reports";
    if (file.fieldname === "photo" || file.fieldname === "club_logo") sub = "players";
    else if (file.fieldname === "video_corrective_file") sub = "correctives";
    const dir = path.join(UPLOADS_DIR, sub);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = mimeMapFor(file.fieldname)[file.mimetype] || "";
    cb(null, crypto.randomBytes(16).toString("hex") + ext);
  },
});

// Les vidéos peuvent être volumineuses (export Hudl/SportsCode) : limite
// large commune à tous les champs, adaptée dans les messages d'erreur.
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (mimeMapFor(file.fieldname)[file.mimetype]) return cb(null, true);
    cb(new Error("UNSUPPORTED_TYPE"));
  },
});

function humanizeUploadError(err) {
  if (err.code === "LIMIT_FILE_SIZE") return "Un des fichiers dépasse la taille maximale autorisée (2 Go).";
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")
    return "Trop de fichiers envoyés en une fois.";
  if (err.message === "UNSUPPORTED_TYPE")
    return "Format de fichier non autorisé (images : PNG/JPG/WEBP/PDF — vidéos : MP4/MOV/WEBM).";
  if (err.code === "ENOSPC")
    return "Le serveur n'a plus assez d'espace de stockage pour enregistrer ce fichier. Contacte l'administrateur technique : il faut libérer ou augmenter l'espace disque avant de réessayer.";
  if (
    err.message === "Unexpected end of form" ||
    err.code === "ECONNRESET" ||
    err.code === "ECONNABORTED" ||
    err.code === "EPIPE"
  )
    return "La connexion a été interrompue avant la fin de l'envoi. Vérifie ta connexion et réessaie.";
  return "Erreur lors de l'envoi des fichiers.";
}

// Enveloppes qui transforment une erreur multer en message lisible
// (au lieu d'une page d'erreur 500 générique). On journalise aussi l'erreur
// d'origine (code technique) pour pouvoir diagnostiquer un futur incident
// depuis les logs Railway, même si l'utilisateur ne voit qu'un message
// simple.
function uploadReportFiles(req, res, next) {
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "video_files", maxCount: 5 },
  ])(req, res, (err) => {
    if (err) {
      console.error("Échec d'envoi de fichier (rapport) :", err.code || err.message, err);
      req.uploadError = humanizeUploadError(err);
    }
    if (!req.files) req.files = {};
    next();
  });
}

function uploadPlayerFiles(req, res, next) {
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "club_logo", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      console.error("Échec d'envoi de fichier (joueur) :", err.code || err.message, err);
      req.uploadError = humanizeUploadError(err);
    }
    if (!req.files) req.files = {};
    next();
  });
}

function uploadCorrectiveVideo(req, res, next) {
  upload.fields([{ name: "video_corrective_file", maxCount: 1 }])(req, res, (err) => {
    if (err) {
      console.error("Échec d'envoi de fichier (vidéo corrective) :", err.code || err.message, err);
      req.uploadError = humanizeUploadError(err);
    }
    if (!req.files) req.files = {};
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
  const activePlayerCount = db.prepare("SELECT COUNT(*) AS n FROM players WHERE actif = 1").get().n;
  const reportsThisMonth = db
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')")
    .get().n;
  const videoCount = db.prepare("SELECT COUNT(*) AS n FROM report_videos").get().n;
  const diskSpace = getDiskSpace(UPLOADS_DIR);

  res.render("admin/dashboard", {
    players,
    recentReports,
    reportCount,
    activePlayerCount,
    reportsThisMonth,
    videoCount,
    adminUsername: req.session.adminUsername,
    diskSpace,
  });
});

// ---------- Gestion des joueurs ----------

router.get("/joueurs", (req, res) => {
  res.render("admin/joueurs", { players: listPlayersAvecDernierRapport() });
});

router.get("/joueurs/nouveau", (req, res) => {
  res.render("admin/joueur-nouveau", { error: null, values: {} });
});

router.post("/joueurs", uploadPlayerFiles, (req, res) => {
  const {
    prenom,
    nom,
    poste,
    club_nom,
    club_pays,
    taille_cm,
    nb_matchs,
    numero,
    date_naissance,
    nationalite,
    pied_fort,
    points_forts,
    axes_amelioration,
    plan_travail,
  } = req.body;
  if (req.uploadError || !prenom || !nom) {
    return res.status(400).render("admin/joueur-nouveau", {
      error: req.uploadError || "Le prénom et le nom sont obligatoires.",
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

  const photoFile = req.files.photo && req.files.photo[0];
  const logoFile = req.files.club_logo && req.files.club_logo[0];

  const result = db
    .prepare(
      `INSERT INTO players
        (identifiant, code_hash, prenom, nom, poste, club_nom, club_pays, taille_cm, nb_matchs,
         photo_filename, club_logo_filename, numero, date_naissance, nationalite, pied_fort,
         points_forts, axes_amelioration, plan_travail, must_change_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      identifiant,
      codeHash,
      prenom.trim(),
      nom.trim(),
      (poste || "").trim(),
      (club_nom || "").trim(),
      (club_pays || "").trim(),
      taille_cm ? parseInt(taille_cm, 10) : null,
      nb_matchs ? parseInt(nb_matchs, 10) : 0,
      photoFile ? photoFile.filename : null,
      logoFile ? logoFile.filename : null,
      numero ? parseInt(numero, 10) : null,
      date_naissance || null,
      (nationalite || "").trim(),
      (pied_fort || "").trim(),
      (points_forts || "").trim(),
      (axes_amelioration || "").trim(),
      (plan_travail || "").trim()
    );

  res.render("admin/joueur-code", {
    player: { id: result.lastInsertRowid, prenom, nom, identifiant },
    code,
    reset: false,
  });
});

router.get("/joueurs/:id", (req, res) => {
  const fiche = getFicheJoueur(req.params.id);
  if (!fiche) return res.status(404).render("404");
  res.render("admin/joueur-detail", { ...fiche, error: null });
});

router.post("/joueurs/:id", uploadPlayerFiles, (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  if (req.uploadError) {
    const reports = db
      .prepare("SELECT * FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC")
      .all(player.id);
    const videosCorrectives = db
      .prepare("SELECT * FROM videos_correctives WHERE player_id = ? ORDER BY created_at DESC")
      .all(player.id);
    const objectifs = db
      .prepare("SELECT * FROM objectifs WHERE player_id = ? ORDER BY atteint ASC, created_at DESC")
      .all(player.id);
    return res
      .status(400)
      .render("admin/joueur-detail", { player, reports, videosCorrectives, objectifs, error: req.uploadError });
  }

  const {
    prenom,
    nom,
    poste,
    actif,
    club_nom,
    club_pays,
    taille_cm,
    nb_matchs,
    numero,
    date_naissance,
    nationalite,
    pied_fort,
    points_forts,
    axes_amelioration,
    plan_travail,
  } = req.body;

  const photoFile = req.files.photo && req.files.photo[0];
  const logoFile = req.files.club_logo && req.files.club_logo[0];

  let photoFilename = player.photo_filename;
  if (photoFile) {
    if (player.photo_filename) {
      fs.rm(path.join(UPLOADS_DIR, "players", player.photo_filename), { force: true }, () => {});
    }
    photoFilename = photoFile.filename;
  } else if (req.body.remove_photo && player.photo_filename) {
    fs.rm(path.join(UPLOADS_DIR, "players", player.photo_filename), { force: true }, () => {});
    photoFilename = null;
  }

  let logoFilename = player.club_logo_filename;
  if (logoFile) {
    if (player.club_logo_filename) {
      fs.rm(path.join(UPLOADS_DIR, "players", player.club_logo_filename), { force: true }, () => {});
    }
    logoFilename = logoFile.filename;
  } else if (req.body.remove_club_logo && player.club_logo_filename) {
    fs.rm(path.join(UPLOADS_DIR, "players", player.club_logo_filename), { force: true }, () => {});
    logoFilename = null;
  }

  db.prepare(
    `UPDATE players SET prenom = ?, nom = ?, poste = ?, actif = ?,
     club_nom = ?, club_pays = ?, taille_cm = ?, nb_matchs = ?,
     photo_filename = ?, club_logo_filename = ?,
     numero = ?, date_naissance = ?, nationalite = ?, pied_fort = ?,
     points_forts = ?, axes_amelioration = ?, plan_travail = ? WHERE id = ?`
  ).run(
    prenom.trim(),
    nom.trim(),
    (poste || "").trim(),
    actif ? 1 : 0,
    (club_nom || "").trim(),
    (club_pays || "").trim(),
    taille_cm ? parseInt(taille_cm, 10) : null,
    nb_matchs ? parseInt(nb_matchs, 10) : 0,
    photoFilename,
    logoFilename,
    numero ? parseInt(numero, 10) : null,
    date_naissance || null,
    (nationalite || "").trim(),
    (pied_fort || "").trim(),
    (points_forts || "").trim(),
    (axes_amelioration || "").trim(),
    (plan_travail || "").trim(),
    player.id
  );
  res.redirect(`/admin/joueurs/${player.id}`);
});

// ---------- Aperçu du nouvel espace joueur, côté admin — montre exactement ----------
// ---------- ce que le joueur voit en vrai, sans avoir à se connecter à sa place. ----------

router.get("/joueurs/:id/apercu-espace-joueur", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  res.render("admin/apercu-espace-joueur", buildEspaceJoueurData(player));
});

// Depuis l'aperçu ci-dessus, "Voir l'analyse" ouvre CETTE page (lecture seule,
// strictement identique à ce que le joueur voit) et non le formulaire
// d'édition — pour que l'aperçu reste un miroir fidèle jusqu'au bout.
// Pour modifier un rapport, l'agence passe par la fiche du joueur comme avant.
router.get("/rapports/:id/lecture-seule", (req, res) => {
  const data = buildRapportLectureSeule(req.params.id);
  if (!data) return res.status(404).render("404");

  res.render("joueur/rapport-detail", {
    ...data,
    backHref: `/admin/joueurs/${data.player.id}/apercu-espace-joueur`,
    backLabel: "Retour à l'aperçu",
  });
});

// ---------- Vidéos correctives (bêta) — alimentent l'onglet "Analyses" ----------

const THEMES_ANALYSES = [
  "Animation offensive",
  "Animation défensive",
  "Transition offensive",
  "Transition défensive",
  "Technique individuelle",
  "Prise d'information",
  "Prise de décision",
  "CPA",
];

function reportsPourSelect(playerId) {
  return db
    .prepare(
      "SELECT id, titre, date_match, adversaire FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC"
    )
    .all(playerId);
}

router.get("/joueurs/:id/videos-correctives/nouvelle", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");
  res.render("admin/video-corrective-form", {
    player,
    video: null,
    reports: reportsPourSelect(player.id),
    themes: THEMES_ANALYSES,
    error: null,
    editing: false,
  });
});

router.post("/joueurs/:id/videos-correctives", uploadCorrectiveVideo, (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  const { titre, theme, commentaire, duree, report_id, video_corrective_url } = req.body;

  if (req.uploadError || !titre || !titre.trim() || !THEMES_ANALYSES.includes(theme)) {
    return res.status(400).render("admin/video-corrective-form", {
      player,
      video: req.body,
      reports: reportsPourSelect(player.id),
      themes: THEMES_ANALYSES,
      error: req.uploadError || "Le titre et le thème sont obligatoires.",
      editing: false,
    });
  }

  let reportIdValue = report_id ? parseInt(report_id, 10) : null;
  if (reportIdValue && !db.prepare("SELECT 1 FROM reports WHERE id = ? AND player_id = ?").get(reportIdValue, player.id)) {
    reportIdValue = null;
  }

  const file = req.files.video_corrective_file && req.files.video_corrective_file[0];

  db.prepare(
    `INSERT INTO videos_correctives
      (player_id, report_id, titre, theme, commentaire, duree, url, filename, original_name, mimetype)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    player.id,
    reportIdValue,
    titre.trim(),
    theme,
    (commentaire || "").trim(),
    (duree || "").trim(),
    (video_corrective_url || "").trim(),
    file ? file.filename : null,
    file ? file.originalname : null,
    file ? file.mimetype : null
  );

  res.redirect(`/admin/joueurs/${player.id}`);
});

router.get("/videos-correctives/:id", (req, res) => {
  const video = db.prepare("SELECT * FROM videos_correctives WHERE id = ?").get(req.params.id);
  if (!video) return res.status(404).render("404");
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(video.player_id);
  res.render("admin/video-corrective-form", {
    player,
    video,
    reports: reportsPourSelect(player.id),
    themes: THEMES_ANALYSES,
    error: null,
    editing: true,
  });
});

router.post("/videos-correctives/:id", uploadCorrectiveVideo, (req, res) => {
  const video = db.prepare("SELECT * FROM videos_correctives WHERE id = ?").get(req.params.id);
  if (!video) return res.status(404).render("404");
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(video.player_id);

  const { titre, theme, commentaire, duree, report_id, video_corrective_url, remove_video_file } = req.body;

  if (req.uploadError || !titre || !titre.trim() || !THEMES_ANALYSES.includes(theme)) {
    return res.status(400).render("admin/video-corrective-form", {
      player,
      video: { ...video, ...req.body },
      reports: reportsPourSelect(player.id),
      themes: THEMES_ANALYSES,
      error: req.uploadError || "Le titre et le thème sont obligatoires.",
      editing: true,
    });
  }

  let reportIdValue = report_id ? parseInt(report_id, 10) : null;
  if (reportIdValue && !db.prepare("SELECT 1 FROM reports WHERE id = ? AND player_id = ?").get(reportIdValue, player.id)) {
    reportIdValue = null;
  }

  const file = req.files.video_corrective_file && req.files.video_corrective_file[0];
  let filename = video.filename;
  let originalName = video.original_name;
  let mimetype = video.mimetype;

  if (file) {
    if (video.filename) fs.rm(path.join(UPLOADS_DIR, "correctives", video.filename), { force: true }, () => {});
    filename = file.filename;
    originalName = file.originalname;
    mimetype = file.mimetype;
  } else if (remove_video_file && video.filename) {
    fs.rm(path.join(UPLOADS_DIR, "correctives", video.filename), { force: true }, () => {});
    filename = null;
    originalName = null;
    mimetype = null;
  }

  db.prepare(
    `UPDATE videos_correctives SET report_id = ?, titre = ?, theme = ?, commentaire = ?, duree = ?, url = ?,
     filename = ?, original_name = ?, mimetype = ? WHERE id = ?`
  ).run(
    reportIdValue,
    titre.trim(),
    theme,
    (commentaire || "").trim(),
    (duree || "").trim(),
    (video_corrective_url || "").trim(),
    filename,
    originalName,
    mimetype,
    video.id
  );

  res.redirect(`/admin/joueurs/${player.id}`);
});

router.post("/videos-correctives/:id/supprimer", (req, res) => {
  const video = db.prepare("SELECT * FROM videos_correctives WHERE id = ?").get(req.params.id);
  if (!video) return res.status(404).render("404");
  if (video.filename) fs.rm(path.join(UPLOADS_DIR, "correctives", video.filename), { force: true }, () => {});
  db.prepare("DELETE FROM videos_correctives WHERE id = ?").run(video.id);
  res.redirect(`/admin/joueurs/${video.player_id}`);
});

// ---------- Objectifs (bêta) — alimentent l'onglet "Progression" ----------

router.get("/joueurs/:id/objectifs/nouveau", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");
  res.render("admin/objectif-form", { player, objectif: null, error: null, editing: false });
});

router.post("/joueurs/:id/objectifs", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  const { titre, progression_pct, atteint } = req.body;
  if (!titre || !titre.trim()) {
    return res.status(400).render("admin/objectif-form", {
      player,
      objectif: req.body,
      error: "Le titre de l'objectif est obligatoire.",
      editing: false,
    });
  }

  let pct = progression_pct ? parseInt(progression_pct, 10) : 0;
  if (Number.isNaN(pct)) pct = 0;
  pct = Math.max(0, Math.min(100, pct));

  db.prepare(
    "INSERT INTO objectifs (player_id, titre, progression_pct, atteint) VALUES (?, ?, ?, ?)"
  ).run(player.id, titre.trim(), atteint ? 100 : pct, atteint ? 1 : 0);

  res.redirect(`/admin/joueurs/${player.id}`);
});

router.get("/objectifs/:id", (req, res) => {
  const objectif = db.prepare("SELECT * FROM objectifs WHERE id = ?").get(req.params.id);
  if (!objectif) return res.status(404).render("404");
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(objectif.player_id);
  res.render("admin/objectif-form", { player, objectif, error: null, editing: true });
});

router.post("/objectifs/:id", (req, res) => {
  const objectif = db.prepare("SELECT * FROM objectifs WHERE id = ?").get(req.params.id);
  if (!objectif) return res.status(404).render("404");
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(objectif.player_id);

  const { titre, progression_pct, atteint } = req.body;
  if (!titre || !titre.trim()) {
    return res.status(400).render("admin/objectif-form", {
      player,
      objectif: { ...objectif, ...req.body },
      error: "Le titre de l'objectif est obligatoire.",
      editing: true,
    });
  }

  let pct = progression_pct ? parseInt(progression_pct, 10) : 0;
  if (Number.isNaN(pct)) pct = 0;
  pct = Math.max(0, Math.min(100, pct));

  db.prepare(
    "UPDATE objectifs SET titre = ?, progression_pct = ?, atteint = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(titre.trim(), atteint ? 100 : pct, atteint ? 1 : 0, objectif.id);

  res.redirect(`/admin/joueurs/${player.id}`);
});

router.post("/objectifs/:id/supprimer", (req, res) => {
  const objectif = db.prepare("SELECT * FROM objectifs WHERE id = ?").get(req.params.id);
  if (!objectif) return res.status(404).render("404");
  db.prepare("DELETE FROM objectifs WHERE id = ?").run(objectif.id);
  res.redirect(`/admin/joueurs/${objectif.player_id}`);
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
    fs.rm(path.join(UPLOADS_DIR, "reports", img.filename), { force: true }, () => {});
  }

  const videos = db
    .prepare(
      `SELECT report_videos.* FROM report_videos
       JOIN reports ON reports.id = report_videos.report_id
       WHERE reports.player_id = ? AND report_videos.filename IS NOT NULL`
    )
    .all(player.id);
  for (const vid of videos) {
    fs.rm(path.join(UPLOADS_DIR, "reports", vid.filename), { force: true }, () => {});
  }

  if (player.photo_filename) {
    fs.rm(path.join(UPLOADS_DIR, "players", player.photo_filename), { force: true }, () => {});
  }
  if (player.club_logo_filename) {
    fs.rm(path.join(UPLOADS_DIR, "players", player.club_logo_filename), { force: true }, () => {});
  }

  const correctiveVideos = db
    .prepare("SELECT * FROM videos_correctives WHERE player_id = ? AND filename IS NOT NULL")
    .all(player.id);
  for (const cv of correctiveVideos) {
    fs.rm(path.join(UPLOADS_DIR, "correctives", cv.filename), { force: true }, () => {});
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

// Notes de performance (0 à 10, décimales acceptées, virgule ou point) —
// toujours optionnelles ; une valeur vide ou invalide devient NULL.
function parseScore(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(10, n));
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

router.post("/joueurs/:id/rapports", uploadReportFiles, (req, res, next) => {
  try {
    const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
    if (!player) return res.status(404).render("404");

    const {
      titre,
      date_match,
      adversaire,
      resultat,
      texte,
      competition,
      minutes_jouees,
      note_globale,
      duels,
      passes,
      vitesse,
      placement,
      technique,
      relance,
    } = req.body;

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
        `INSERT INTO reports
          (player_id, titre, date_match, adversaire, resultat, texte, stats_json, competition, minutes_jouees,
           note_globale, duels, passes, vitesse, placement, technique, relance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        player.id,
        titre.trim(),
        date_match || null,
        (adversaire || "").trim(),
        (resultat || "").trim(),
        (texte || "").trim(),
        JSON.stringify(stats),
        (competition || "").trim(),
        minutes_jouees ? parseInt(minutes_jouees, 10) : null,
        parseScore(note_globale),
        parseScore(duels),
        parseScore(passes),
        parseScore(vitesse),
        parseScore(placement),
        parseScore(technique),
        parseScore(relance)
      );

    const reportId = result.lastInsertRowid;

    const insertVideo = db.prepare(
      `INSERT INTO report_videos (report_id, label, url, ordre, filename, original_name, mimetype)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    videos.forEach((v, i) => insertVideo.run(reportId, v.label, v.url, i, null, null, null));

    const videoFiles = req.files.video_files || [];
    videoFiles.forEach((f, i) =>
      insertVideo.run(reportId, f.originalname || "Vidéo", "", videos.length + i, f.filename, f.originalname, f.mimetype)
    );

    const insertImage = db.prepare(
      "INSERT INTO report_images (report_id, filename, original_name, ordre) VALUES (?, ?, ?, ?)"
    );
    (req.files.images || []).forEach((f, i) =>
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

router.post("/rapports/:id", uploadReportFiles, (req, res, next) => {
  try {
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
    if (!report) return res.status(404).render("404");
    const player = db.prepare("SELECT * FROM players WHERE id = ?").get(report.player_id);

    const {
      titre,
      date_match,
      adversaire,
      resultat,
      texte,
      competition,
      minutes_jouees,
      note_globale,
      duels,
      passes,
      vitesse,
      placement,
      technique,
      relance,
    } = req.body;

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
       stats_json = ?, competition = ?, minutes_jouees = ?,
       note_globale = ?, duels = ?, passes = ?, vitesse = ?, placement = ?, technique = ?, relance = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(
      titre.trim(),
      date_match || null,
      (adversaire || "").trim(),
      (resultat || "").trim(),
      (texte || "").trim(),
      JSON.stringify(stats),
      (competition || "").trim(),
      minutes_jouees ? parseInt(minutes_jouees, 10) : null,
      parseScore(note_globale),
      parseScore(duels),
      parseScore(passes),
      parseScore(vitesse),
      parseScore(placement),
      parseScore(technique),
      parseScore(relance),
      report.id
    );

    // Les liens vidéo (label + URL) sont entièrement remplacés à chaque
    // enregistrement ; les vidéos déposées en fichier sont conservées
    // sauf si elles sont explicitement cochées pour suppression plus bas.
    db.prepare(
      "DELETE FROM report_videos WHERE report_id = ? AND (filename IS NULL OR filename = '')"
    ).run(report.id);
    const insertVideo = db.prepare(
      `INSERT INTO report_videos (report_id, label, url, ordre, filename, original_name, mimetype)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    videos.forEach((v, i) => insertVideo.run(report.id, v.label, v.url, i, null, null, null));

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

    // Suppression de vidéos (fichiers) existantes cochées
    const toDeleteVideos = [].concat(req.body.remove_video || []);
    if (toDeleteVideos.length) {
      const placeholders = toDeleteVideos.map(() => "?").join(",");
      const vids = db
        .prepare(`SELECT * FROM report_videos WHERE id IN (${placeholders}) AND report_id = ?`)
        .all(...toDeleteVideos, report.id);
      for (const vid of vids) {
        if (vid.filename) fs.rm(path.join(UPLOADS_DIR, "reports", vid.filename), { force: true }, () => {});
      }
      db.prepare(`DELETE FROM report_videos WHERE id IN (${placeholders}) AND report_id = ?`).run(
        ...toDeleteVideos,
        report.id
      );
    }

    const currentMax =
      db.prepare("SELECT MAX(ordre) AS m FROM report_images WHERE report_id = ?").get(report.id)
        .m || 0;
    const insertImage = db.prepare(
      "INSERT INTO report_images (report_id, filename, original_name, ordre) VALUES (?, ?, ?, ?)"
    );
    (req.files.images || []).forEach((f, i) =>
      insertImage.run(report.id, f.filename, f.originalname, currentMax + i + 1)
    );

    const currentMaxV =
      db.prepare("SELECT MAX(ordre) AS m FROM report_videos WHERE report_id = ?").get(report.id)
        .m || 0;
    const videoFiles = req.files.video_files || [];
    videoFiles.forEach((f, i) =>
      insertVideo.run(
        report.id,
        f.originalname || "Vidéo",
        "",
        currentMaxV + i + 1,
        f.filename,
        f.originalname,
        f.mimetype
      )
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
  const videos = db.prepare("SELECT * FROM report_videos WHERE report_id = ?").all(report.id);
  for (const vid of videos) {
    if (vid.filename) fs.rm(path.join(UPLOADS_DIR, "reports", vid.filename), { force: true }, () => {});
  }
  db.prepare("DELETE FROM reports WHERE id = ?").run(report.id);
  res.redirect(`/admin/joueurs/${report.player_id}`);
});

// ---------- Changer son propre mot de passe admin ----------

function getCollabIdentifiant() {
  const acces = db.prepare("SELECT identifiant FROM collaborateur_acces WHERE id = 1").get();
  return acces ? acces.identifiant : null;
}

router.get("/mon-compte", (req, res) => {
  res.render("admin/mon-compte", {
    error: null,
    success: null,
    collabError: null,
    collabSuccess: null,
    collabIdentifiant: getCollabIdentifiant(),
  });
});

router.post("/mon-compte", (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.adminId);
  const collabIdentifiant = getCollabIdentifiant();

  if (!bcrypt.compareSync(current_password || "", admin.password_hash)) {
    return res.render("admin/mon-compte", {
      error: "Mot de passe actuel incorrect.",
      success: null,
      collabError: null,
      collabSuccess: null,
      collabIdentifiant,
    });
  }
  if (!new_password || new_password.length < 8) {
    return res.render("admin/mon-compte", {
      error: "Le nouveau mot de passe doit faire au moins 8 caractères.",
      success: null,
      collabError: null,
      collabSuccess: null,
      collabIdentifiant,
    });
  }
  if (new_password !== confirm_password) {
    return res.render("admin/mon-compte", {
      error: "Les deux mots de passe ne correspondent pas.",
      success: null,
      collabError: null,
      collabSuccess: null,
      collabIdentifiant,
    });
  }

  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(new_password, 10),
    admin.id
  );
  res.render("admin/mon-compte", {
    error: null,
    success: "Mot de passe mis à jour.",
    collabError: null,
    collabSuccess: null,
    collabIdentifiant,
  });
});

// ---------- Accès collaborateurs (lecture seule, identifiant partagé) ----------
// Table indépendante (collaborateur_acces), une seule ligne : à chaque
// enregistrement, l'identifiant/code précédent est entièrement remplacé.

router.post("/collaborateur-acces", (req, res) => {
  const { collab_identifiant, collab_code } = req.body;
  const identifiant = (collab_identifiant || "").trim();
  const code = collab_code || "";
  const rendreErreur = (message) =>
    res.render("admin/mon-compte", {
      error: null,
      success: null,
      collabError: message,
      collabSuccess: null,
      collabIdentifiant: getCollabIdentifiant(),
    });

  if (!identifiant) return rendreErreur("L'identifiant collaborateur est obligatoire.");
  if (!code || code.length < 4) return rendreErreur("Le code doit faire au moins 4 caractères.");

  const codeHash = bcrypt.hashSync(code, 10);
  db.prepare(
    `INSERT INTO collaborateur_acces (id, identifiant, code_hash, updated_at)
     VALUES (1, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET identifiant = excluded.identifiant, code_hash = excluded.code_hash, updated_at = excluded.updated_at`
  ).run(identifiant, codeHash);

  res.render("admin/mon-compte", {
    error: null,
    success: null,
    collabError: null,
    collabSuccess: "Accès collaborateur mis à jour. Communique le nouvel identifiant et le nouveau code à ton équipe.",
    collabIdentifiant: identifiant,
  });
});

module.exports = router;
