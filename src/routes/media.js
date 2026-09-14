// Sert les images/PDF des rapports après vérification des droits :
// un admin peut tout voir, un joueur seulement ses propres fichiers.
// Les fichiers ne sont PAS dans /public pour éviter qu'une simple URL
// devinée donne accès à un rapport sans être connecté.

const express = require("express");
const path = require("path");
const { db, UPLOADS_DIR } = require("../db");

const router = express.Router();

router.get("/rapport-image/:imageId", (req, res) => {
  const image = db.prepare("SELECT * FROM report_images WHERE id = ?").get(req.params.imageId);
  if (!image) return res.status(404).render("404");

  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(image.report_id);
  if (!report) return res.status(404).render("404");

  const isAdmin = !!(req.session && req.session.adminId);
  const isOwningPlayer = !!(req.session && req.session.playerId === report.player_id);

  if (!isAdmin && !isOwningPlayer) {
    return res.status(403).render("404");
  }

  const filePath = path.join(UPLOADS_DIR, "reports", image.filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).render("404");
  });
});

module.exports = router;
