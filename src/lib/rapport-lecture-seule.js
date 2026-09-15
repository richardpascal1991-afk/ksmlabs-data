// Données d'un rapport en lecture seule — strictement identiques à ce que le
// joueur voit sur sa propre page, aucun champ modifiable. Utilisé à la fois
// par l'aperçu admin ("Voir comme le joueur") et par l'espace collaborateur,
// pour ne jamais dupliquer cette logique à deux endroits différents.

const { db } = require("../db");
const { getEmbeddableVideo, enrichStatsForDisplay } = require("../utils");

function buildRapportLectureSeule(reportId) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report) return null;
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(report.player_id);

  const videos = db
    .prepare("SELECT * FROM report_videos WHERE report_id = ? ORDER BY ordre")
    .all(report.id)
    .map((v) => ({ ...v, embedUrl: v.filename ? null : getEmbeddableVideo(v.url) }));
  const images = db
    .prepare("SELECT * FROM report_images WHERE report_id = ? ORDER BY ordre")
    .all(report.id);
  const stats = enrichStatsForDisplay(JSON.parse(report.stats_json || "[]"));

  return { player, report, videos, images, stats };
}

module.exports = { buildRapportLectureSeule };
