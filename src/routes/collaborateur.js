// Espace collaborateur : accès en LECTURE SEULE à toutes les fiches joueurs.
// Un seul identifiant/code, partagé et configuré par l'agence depuis
// "Mon compte" (admin). Aucune route de création, modification ou
// suppression n'existe ici — toutes les pages réutilisent exactement les
// mêmes vues que l'espace admin, avec les actions d'édition masquées.

const express = require("express");
const { requireCollaborateur } = require("../middleware/auth");
const { listPlayersAvecDernierRapport, getFicheJoueur } = require("../lib/joueurs");
const { buildRapportLectureSeule } = require("../lib/rapport-lecture-seule");

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
