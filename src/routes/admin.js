const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { db, UPLOADS_DIR } = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { generateAccessCode, slugifyIdentifiant, formatDateFr, getEmbeddableVideo } = require("../utils");

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
  limits: { fileSize: 400 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (mimeMapFor(file.fieldname)[file.mimetype]) return cb(null, true);
    cb(new Error("UNSUPPORTED_TYPE"));
  },
});

function humanizeUploadError(err) {
  if (err.code === "LIMIT_FILE_SIZE") return "Un des fichiers dépasse la taille maximale autorisée (400 Mo).";
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")
    return "Trop de fichiers envoyés en une fois.";
  if (err.message === "UNSUPPORTED_TYPE")
    return "Format de fichier non autorisé (images : PNG/JPG/WEBP/PDF — vidéos : MP4/MOV/WEBM).";
  return "Erreur lors de l'envoi des fichiers.";
}

// Enveloppes qui transforment une erreur multer en message lisible
// (au lieu d'une page d'erreur 500 générique).
function uploadReportFiles(req, res, next) {
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "video_files", maxCount: 5 },
  ])(req, res, (err) => {
    if (err) req.uploadError = humanizeUploadError(err);
    if (!req.files) req.files = {};
    next();
  });
}

function uploadPlayerFiles(req, res, next) {
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "club_logo", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) req.uploadError = humanizeUploadError(err);
    if (!req.files) req.files = {};
    next();
  });
}

function uploadCorrectiveVideo(req, res, next) {
  upload.fields([{ name: "video_corrective_file", maxCount: 1 }])(req, res, (err) => {
    if (err) req.uploadError = humanizeUploadError(err);
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

  res.render("admin/dashboard", {
    players,
    recentReports,
    reportCount,
    activePlayerCount,
    reportsThisMonth,
    videoCount,
    adminUsername: req.session.adminUsername,
  });
});

// ---------- Gestion des joueurs ----------

router.get("/joueurs", (req, res) => {
  // Lecture seule : on ajoute juste, pour chaque joueur, la date de son
  // dernier rapport publié (aucune donnée n'est modifiée ni ajoutée en base).
  const rows = db
    .prepare(
      `SELECT players.*,
         (SELECT MAX(reports.created_at) FROM reports WHERE reports.player_id = players.id) AS dernier_rapport_le
       FROM players ORDER BY nom, prenom`
    )
    .all();
  const players = rows.map((p) => ({
    ...p,
    dernier_rapport_fr: p.dernier_rapport_le ? formatDateFr(p.dernier_rapport_le) : null,
  }));
  res.render("admin/joueurs", { players });
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
         photo_filename, club_logo_filename, numero, date_naissance, nationalite, pied_fort, must_change_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
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
      (pied_fort || "").trim()
    );

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
  const videosCorrectives = db
    .prepare("SELECT * FROM videos_correctives WHERE player_id = ? ORDER BY created_at DESC")
    .all(player.id);
  res.render("admin/joueur-detail", { player, reports, videosCorrectives, error: null });
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
    return res.status(400).render("admin/joueur-detail", { player, reports, videosCorrectives, error: req.uploadError });
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
     numero = ?, date_naissance = ?, nationalite = ?, pied_fort = ? WHERE id = ?`
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
    player.id
  );
  res.redirect(`/admin/joueurs/${player.id}`);
});

// ---------- Aperçu (bêta) du nouvel espace joueur — page séparée, non ----------
// ---------- connectée à l'espace joueur actuel, pour validation avant ----------
// ---------- remplacement éventuel. ----------

function calculerAge(dateNaissance) {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance.getTime())) return null;
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - naissance.getFullYear();
  const pasEncoreAnniversaire =
    aujourdhui.getMonth() < naissance.getMonth() ||
    (aujourdhui.getMonth() === naissance.getMonth() && aujourdhui.getDate() < naissance.getDate());
  if (pasEncoreAnniversaire) age--;
  return age;
}

const AXES_RADAR = [
  { key: "duels", label: "Duels" },
  { key: "passes", label: "Passes" },
  { key: "vitesse", label: "Vitesse" },
  { key: "placement", label: "Placement" },
  { key: "technique", label: "Technique" },
  { key: "relance", label: "Relance" },
];

function formatNoteFr(n) {
  return n.toFixed(1).replace(".", ",");
}

// Calcule les points SVG d'un radar régulier à N axes (centre 110,100,
// rayon 86 — mêmes proportions que la maquette validée), sans dépendre
// d'une librairie externe.
function radarGeometry(axesValues) {
  const cx = 110;
  const cy = 100;
  const maxR = 86;
  const n = axesValues.length;
  const angleFor = (i) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pointAt = (i, r) => {
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const grid = [1, 0.66, 0.33].map((level) =>
    axesValues
      .map((_, i) => pointAt(i, maxR * level))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ")
  );
  const axisLines = axesValues.map((_, i) => {
    const p = pointAt(i, maxR);
    return { x1: cx, y1: cy, x2: p.x.toFixed(1), y2: p.y.toFixed(1) };
  });
  const dataPoints = axesValues
    .map((a, i) => pointAt(i, (Math.max(0, Math.min(10, a.value)) / 10) * maxR))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const labels = axesValues.map((a, i) => {
    const p = pointAt(i, maxR + 14);
    let anchor = "middle";
    if (p.x > cx + 5) anchor = "start";
    else if (p.x < cx - 5) anchor = "end";
    return { text: a.label, x: p.x.toFixed(1), y: p.y.toFixed(1), anchor };
  });
  return { grid, axisLines, dataPoints, labels };
}

router.get("/joueurs/:id/apercu-espace-joueur", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  const dernierRapport = db
    .prepare("SELECT created_at FROM reports WHERE player_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(player.id);

  const rapportsBruts = db
    .prepare("SELECT * FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC")
    .all(player.id);
  const matchs = rapportsBruts.map((r) => ({
    id: r.id,
    dateFr: r.date_match ? formatDateFr(r.date_match) : "Date non renseignée",
    adversaire: r.adversaire || "Adversaire non renseigné",
    competition: r.competition || null,
    resultat: r.resultat || null,
    minutesJouees: r.minutes_jouees || null,
  }));

  const videosBrutes = db
    .prepare("SELECT * FROM videos_correctives WHERE player_id = ? ORDER BY created_at DESC")
    .all(player.id);
  const analyses = videosBrutes.map((v) => {
    const rapportLie = v.report_id ? rapportsBruts.find((r) => r.id === v.report_id) : null;
    return {
      id: v.id,
      titre: v.titre,
      theme: v.theme,
      commentaire: v.commentaire || "",
      duree: v.duree || null,
      matchLabel: rapportLie
        ? (rapportLie.adversaire ? "vs " + rapportLie.adversaire : rapportLie.titre)
        : null,
      videoSrc: v.filename ? `/media/video-corrective/${v.id}` : null,
      embedUrl: !v.filename && v.url ? getEmbeddableVideo(v.url) : null,
      lienExterne: !v.filename && v.url && !getEmbeddableVideo(v.url) ? v.url : null,
      nouveau: !v.vu_le,
      createdFr: formatDateFr(v.created_at),
    };
  });

  // ---- Onglet Data : radar, courbe d'évolution, comparaison ----
  // rapportsBruts est trié du plus récent au plus ancien.

  let radar = null;
  const radarReport = rapportsBruts.find((r) => AXES_RADAR.every((a) => r[a.key] !== null && r[a.key] !== undefined));
  if (radarReport) {
    radar = {
      geometry: radarGeometry(AXES_RADAR.map((a) => ({ label: a.label, value: radarReport[a.key] }))),
      dateFr: radarReport.date_match ? formatDateFr(radarReport.date_match) : formatDateFr(radarReport.created_at),
    };
  }

  const matchsAvecNote = rapportsBruts
    .filter((r) => r.note_globale !== null && r.note_globale !== undefined)
    .slice(0, 5)
    .slice()
    .reverse();

  let evolution = null;
  if (matchsAvecNote.length >= 2) {
    const stepX = 300 / (matchsAvecNote.length - 1);
    const toY = (v) => 84 - (Math.max(0, Math.min(10, v)) / 10) * 78;
    const polylinePoints = matchsAvecNote
      .map((r, i) => `${(i * stepX).toFixed(1)},${toY(r.note_globale).toFixed(1)}`)
      .join(" ");
    evolution = {
      polylinePoints,
      count: matchsAvecNote.length,
      premiereFr: formatNoteFr(matchsAvecNote[0].note_globale),
      derniereFr: formatNoteFr(matchsAvecNote[matchsAvecNote.length - 1].note_globale),
    };
  }

  const comparaison = AXES_RADAR.map((a) => {
    const valeurs = rapportsBruts.filter((r) => r[a.key] !== null && r[a.key] !== undefined);
    if (valeurs.length < 2) return null;
    const latest = valeurs[0][a.key];
    const moyenne = valeurs.reduce((sum, r) => sum + r[a.key], 0) / valeurs.length;
    const diff = latest - moyenne;
    let tendance = "flat";
    if (diff > 0.3) tendance = "up";
    else if (diff < -0.3) tendance = "down";
    return { label: a.label, latestFr: formatNoteFr(latest), moyenneFr: formatNoteFr(moyenne), tendance };
  }).filter(Boolean);

  res.render("admin/apercu-espace-joueur", {
    player,
    age: calculerAge(player.date_naissance),
    dateNaissanceFr: player.date_naissance ? formatDateFr(player.date_naissance) : null,
    dernierRapportFr: dernierRapport ? formatDateFr(dernierRapport.created_at) : null,
    matchs,
    analyses,
    radar,
    evolution,
    comparaison: comparaison.length ? comparaison : null,
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
