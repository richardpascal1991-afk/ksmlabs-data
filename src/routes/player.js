const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { requirePlayer } = require("../middleware/auth");
const { getEmbeddableVideo, enrichStatsForDisplay } = require("../utils");

const router = express.Router();
router.use(requirePlayer);

// Force le changement du code fourni par l'agence dès la première connexion,
// pour que le joueur soit le seul à connaître son code définitif.
router.use((req, res, next) => {
  if (req.path.startsWith("/mon-compte")) return next();
  const player = db.prepare("SELECT must_change_code FROM players WHERE id = ?").get(req.session.playerId);
  if (player && player.must_change_code) {
    return res.redirect("/joueur/mon-compte");
  }
  next();
});

router.get("/", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.session.playerId);
  if (!player || !player.actif) {
    req.session.destroy(() => res.redirect("/joueur/login"));
    return;
  }
  const reports = db
    .prepare("SELECT * FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC")
    .all(player.id);
  res.render("joueur/dashboard", { player, reports });
});

router.get("/rapports/:id", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.session.playerId);
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);

  // Un joueur ne peut voir que ses propres rapports.
  if (!report || report.player_id !== player.id) {
    return res.status(404).render("404");
  }

  const videos = db
    .prepare("SELECT * FROM report_videos WHERE report_id = ? ORDER BY ordre")
    .all(report.id)
    .map((v) => ({ ...v, embedUrl: v.filename ? null : getEmbeddableVideo(v.url) }));
  const images = db
    .prepare("SELECT * FROM report_images WHERE report_id = ? ORDER BY ordre")
    .all(report.id);
  const stats = enrichStatsForDisplay(JSON.parse(report.stats_json || "[]"));

  res.render("joueur/rapport-detail", { player, report, videos, images, stats });
});

router.get("/mon-compte", (req, res) => {
  const player = db.prepare("SELECT must_change_code FROM players WHERE id = ?").get(req.session.playerId);
  res.render("joueur/mon-compte", {
    error: null,
    success: null,
    mustChange: !!(player && player.must_change_code),
  });
});

router.post("/mon-compte", (req, res) => {
  const { current_code, new_code, confirm_code } = req.body;
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.session.playerId);
  const mustChange = !!player.must_change_code;

  if (!bcrypt.compareSync(current_code || "", player.code_hash)) {
    return res.render("joueur/mon-compte", { error: "Code actuel incorrect.", success: null, mustChange });
  }
  if (!new_code || new_code.length < 4) {
    return res.render("joueur/mon-compte", {
      error: "Le nouveau code doit faire au moins 4 caractères.",
      success: null,
      mustChange,
    });
  }
  if (new_code !== confirm_code) {
    return res.render("joueur/mon-compte", {
      error: "Les deux codes ne correspondent pas.",
      success: null,
      mustChange,
    });
  }

  db.prepare("UPDATE players SET code_hash = ?, must_change_code = 0 WHERE id = ?").run(
    bcrypt.hashSync(new_code, 10),
    player.id
  );
  res.render("joueur/mon-compte", { error: null, success: "Code mis à jour.", mustChange: false });
});

module.exports = router;
