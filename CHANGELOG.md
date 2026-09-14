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

### Étape 2 — Maquette de la nouvelle interface "espace joueur" (validée, pas encore codée en réel)

Fichier ajouté (documentation, hors application) : `docs/mockups/espace-joueur-v2.html`.

- Maquette visuelle interactive (5 onglets : Profil, Matchs, Analyses, Data, Progression) inspirée des principes de lisibilité d'une application de statistiques sportives, adaptée à l'identité KSM LABS.
- Maquette autonome, non connectée à l'application, non déployée. Toutes les valeurs qui ne correspondent pas encore à un champ existant dans la base de données sont marquées « (exemple) ».
- Validée par l'agence le 15 septembre 2026.

### Étape 3 — Onglet "Profil" connecté à de vraies données (aperçu bêta, page séparée)

Fichiers modifiés : `src/db.js`, `src/routes/admin.js`, `views/admin/joueur-nouveau.ejs`, `views/admin/joueur-detail.ejs`.
Fichiers ajoutés : `views/admin/apercu-espace-joueur.ejs`, `public/css/apercu-joueur.css`, `public/js/apercu-joueur.js`.

- Base de données : 4 nouvelles colonnes ajoutées à la table `players` (autorisation donnée par l'agence) : `numero`, `date_naissance`, `nationalite`, `pied_fort`. Aucune colonne ni donnée existante n'a été modifiée ou supprimée.
- Formulaires admin (nouveau joueur + fiche joueur) : ajout des champs correspondants, tous optionnels.
- Nouvelle page d'aperçu bêta accessible uniquement depuis la fiche d'un joueur (lien "Voir l'aperçu"), à l'adresse `/admin/joueurs/:id/apercu-espace-joueur`. Cette page est totalement séparée de l'espace joueur actuel (`/joueur`), qui reste inchangé et utilisé normalement par les joueurs.
- L'onglet "Profil" de cet aperçu affiche désormais de vraies données : taille, âge (calculé depuis la date de naissance), nationalité, numéro, poste, pied fort, nombre de matchs analysés, date de la dernière analyse publiée.
- Les indicateurs qui n'ont pas encore de source de données réelle (minutes analysées, note moyenne interne, vidéos correctives, objectifs atteints) restent clairement marqués « exemple, pas encore suivi ».
- Les onglets Matchs / Analyses / Data / Progression affichent un message « bientôt disponible » en attendant la prochaine étape.
- Aucune route existante supprimée, aucune fonctionnalité retirée, aucune donnée de joueur modifiée.

### Étape 4 — Onglet "Matchs" connecté à de vraies données (aperçu bêta)

Fichiers modifiés : `src/db.js`, `src/routes/admin.js`, `views/admin/rapport-form.ejs`, `views/admin/apercu-espace-joueur.ejs`, `public/css/apercu-joueur.css`.

- Base de données : 2 nouvelles colonnes ajoutées à la table `reports` (autorisation donnée par l'agence) : `competition`, `minutes_jouees`. Aucune colonne ni donnée existante modifiée ou supprimée.
- Formulaire de rapport (création et modification) : ajout des champs "Compétition" et "Minutes jouées", tous deux optionnels.
- Chaque rapport publié pour un joueur apparaît désormais comme une carte "match" dans l'onglet Matchs de l'aperçu bêta : logo du club (le tien) vs initiales de l'adversaire, date, compétition, résultat, minutes jouées, statut et bouton "Voir l'analyse" qui ouvre le rapport correspondant côté admin.
- Les champs non renseignés affichent un texte honnête ("Compétition non renseignée", etc.) plutôt qu'une donnée inventée.
- Toujours aucune route supprimée, aucune fonctionnalité retirée, aucune donnée existante modifiée.

## Version de référence (avant refonte)

Point de sauvegarde correspondant à la version en ligne avant le début de la refonte (animations joueur, recadrage photo, tableau de bord avec statistiques). Commit local de sauvegarde : "backup avant refonte UI KSM LABS".
