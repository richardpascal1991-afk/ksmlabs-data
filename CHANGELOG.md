# Journal des modifications — KSMLABS

Toutes les modifications apportées au site sont listées ici, de la plus récente à la plus ancienne.

## En cours — Refonte de l'interface (étape par étape)

### Étape 1 — Page "Joueurs" (espace administrateur)

Fichiers modifiés : `src/routes/admin.js`, `src/utils.js`, `views/admin/joueurs.ejs`, `public/css/style.css`, `views/partials/header.ejs`, `views/partials/footer.ejs`, `public/js/bottom-nav.js` (nouveau).

- Cartes joueurs modernisées (photo agrandie, logo du club affiché séparément).
- Ajout de l'affichage : poste, club, nombre de matchs analysés, date du dernier rapport publié.
- Ajout d'un badge de statut Actif / Inactif toujours visible.
- Retrait de l'identifiant de connexion de la vue liste (reste visible sur la fiche détaillée du joueur).
- Animation légère au clic sur une carte joueur.
- Nouvelle navigation mobile pour l'espace administrateur : menu en bas d'écran remplaçant le menu horizontal du haut (uniquement sur mobile, uniquement côté admin — l'espace joueur n'est pas modifié).
- Aucune donnée existante modifiée, aucune route supprimée, aucune fonctionnalité retirée.

## Version de référence (avant refonte)

Point de sauvegarde correspondant à la version en ligne avant le début de la refonte (animations joueur, recadrage photo, tableau de bord avec statistiques). Commit local de sauvegarde : "backup avant refonte UI KSM LABS".
