// Requêtes partagées pour la liste des joueurs et la fiche d'un joueur.
//
// Utilisé à la fois par l'espace admin (accès complet) et l'espace
// collaborateur (accès lecture seule) — pour que les deux affichent
// toujours exactement les mêmes informations, sans jamais pouvoir
// diverger l'un de l'autre.

const { db } = require("../db");
const { formatDateFr } = require("../utils");

function listPlayersAvecDernierRapport() {
  const rows = db
    .prepare(
      `SELECT players.*,
         (SELECT MAX(reports.created_at) FROM reports WHERE reports.player_id = players.id) AS dernier_rapport_le
       FROM players ORDER BY nom, prenom`
    )
    .all();
  return rows.map((p) => ({
    ...p,
    dernier_rapport_fr: p.dernier_rapport_le ? formatDateFr(p.dernier_rapport_le) : null,
  }));
}

function getFicheJoueur(playerId) {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId);
  if (!player) return null;
  const reports = db
    .prepare("SELECT * FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC")
    .all(player.id);
  const videosCorrectives = db
    .prepare("SELECT * FROM videos_correctives WHERE player_id = ? ORDER BY created_at DESC")
    .all(player.id);
  const objectifs = db
    .prepare("SELECT * FROM objectifs WHERE player_id = ? ORDER BY atteint ASC, created_at DESC")
    .all(player.id);
  return { player, reports, videosCorrectives, objectifs };
}

module.exports = { listPlayersAvecDernierRapport, getFicheJoueur };
