// Espace collaborateur : accès en LECTURE SEULE à toutes les fiches joueurs.
// Un seul identifiant/code, partagé et configuré par l'agence depuis
// "Mon compte" (admin). Aucune route de création, modification ou
// suppression n'existe ici — toutes les pages réutilisent exactement les
// mêmes vues que l'espace admin, avec les actions d'édition masquées.

const express = require("express");
const { requireCollaborateur } = require("../middleware/auth");
const { db } = require("../db");
const { listPlayersAvecDernierRapport, getFicheJoueur } = require("../lib/joueurs");
const { buildRapportLectureSeule } = require("../lib/rapport-lecture-seule");
const { buildEspaceJoueurData } = require("../lib/espace-joueur");

const router = express.Router();
router.use(requireCollaborateur);

router.get("/", (req, res) => res.redirect("/collaborateur/joueurs"));

router.get("/joueurs", (req, res) => {
  const players = listPlayersAvecDernierRapport();
  res.render("admin/joueurs", { players, readOnly: true, baseUrl: "/collaborateur/joueurs" });
});

router.get("/joueurs/:id", (req, res) => {
  const fiche = getFicheJoueur(req.params.id);
  if (!fiche) return res.status(404).render("404");
  res.render("admin/joueur-detail", {
    ...fiche,
    error: null,
    readOnly: true,
    baseUrl: "/collaborateur/joueurs",
  });
});

// Aperçu complet de l'espace joueur (diagrammes, notes match par match,
// évolution, objectifs) — même contenu que l'aperçu admin "Voir comme le
// joueur", en lecture seule, sans aucune icône réglages.
router.get("/joueurs/:id/apercu", (req, res) => {
  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id);
  if (!player) return res.status(404).render("404");

  res.render("collaborateur/apercu-espace-joueur", buildEspaceJoueurData(player));
});

// Rapport en lecture seule (strictement la même page que le joueur voit).
router.get("/rapports/:id", (req, res) => {
  const data = buildRapportLectureSeule(req.params.id);
  if (!data) return res.status(404).render("404");
  res.render("joueur/rapport-detail", {
    ...data,
    backHref: `/collaborateur/joueurs/${data.player.id}`,
    backLabel: "Retour à la fiche",
  });
});

module.exports = router;
