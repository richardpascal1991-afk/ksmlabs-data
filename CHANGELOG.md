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

### Étape 5 — Onglet "Analyses" connecté à de vraies données (aperçu bêta)

Fichiers modifiés : `src/db.js`, `src/routes/admin.js`, `src/routes/media.js`, `views/admin/joueur-detail.ejs`, `views/admin/apercu-espace-joueur.ejs`, `public/css/apercu-joueur.css`.
Fichier ajouté : `views/admin/video-corrective-form.ejs`.

- Base de données : nouvelle table indépendante `videos_correctives` (autorisation donnée par l'agence). Aucune table ni donnée existante n'a été modifiée ou supprimée. Cette table stocke, pour chaque vidéo corrective : le joueur concerné, le match lié (optionnel), le titre, le thème (parmi les 8 catégories définies par l'agence), le commentaire de l'analyste, la durée, un fichier vidéo déposé ou un lien, et deux champs prévus pour le suivi futur "vu" / "compris" côté joueur.
- Fiche joueur (admin) : nouvelle section "Vidéos correctives" avec bouton "+ Nouvelle vidéo corrective" et liste des vidéos déjà ajoutées, chacune modifiable et supprimable.
- Nouveau formulaire admin pour créer/modifier une vidéo corrective : titre, thème (liste des 8 catégories), match concerné (optionnel, parmi les rapports déjà publiés), commentaire, durée, dépôt d'un fichier vidéo (MP4/MOV/WEBM, 400 Mo max) ou lien externe (YouTube, Hudl, SportsCode...).
- L'onglet "Analyses" de l'aperçu bêta affiche désormais chaque vidéo corrective sous forme de carte : thème, titre, match lié, durée, date d'ajout, lecteur vidéo (fichier déposé ou lecteur YouTube intégré) ou lien externe, commentaire de l'analyste.
- Le statut "Nouveau" / "Vu" et le bouton "J'ai compris" restent affichés en exemple : ils ne pourront devenir réellement fonctionnels que lorsque le joueur utilisera cette interface lui-même (pas encore le cas à ce stade).
- Les fichiers vidéo déposés sont protégés comme les vidéos de rapport existantes : accessibles uniquement à l'agence ou au joueur concerné, jamais publiquement.
- Toujours aucune route supprimée, aucune fonctionnalité retirée, aucune donnée existante modifiée.

### Étape 6 — Onglet "Data" connecté à de vraies données (aperçu bêta)

Fichiers modifiés : `src/db.js`, `src/routes/admin.js`, `views/admin/rapport-form.ejs`, `views/admin/apercu-espace-joueur.ejs`, `public/css/apercu-joueur.css`.

- Base de données : 7 nouvelles colonnes optionnelles ajoutées à la table `reports` (autorisation donnée par l'agence) : `note_globale`, `duels`, `passes`, `vitesse`, `placement`, `technique`, `relance` (notes sur 10). Aucune colonne ni donnée existante modifiée ou supprimée.
- Formulaire de rapport : nouvelle section "Données de performance" (optionnelle) permettant de noter le joueur sur 6 axes (les mêmes que la maquette déjà validée) et sur une note globale, match par match.
- L'onglet "Data" de l'aperçu bêta affiche désormais :
  - un radar de compétences réel, basé sur le dernier match entièrement noté sur les 6 axes ;
  - une courbe d'évolution réelle de la note globale sur les 5 derniers matchs notés ;
  - une comparaison réelle, axe par axe, entre la dernière valeur notée et la moyenne de la saison (avec indicateur en hausse / stable / en baisse).
- Tant qu'il n'y a pas assez de matchs notés, chaque bloc affiche un message honnête expliquant ce qu'il faut renseigner pour l'activer, plutôt qu'une donnée inventée.
- Toujours aucune route supprimée, aucune fonctionnalité retirée, aucune donnée existante modifiée.

### Étape 7 — Onglet "Progression" connecté à de vraies données (aperçu bêta)

Fichiers modifiés : `src/db.js`, `src/routes/admin.js`, `views/admin/joueur-detail.ejs`, `views/admin/apercu-espace-joueur.ejs`, `public/css/apercu-joueur.css`.
Fichier ajouté : `views/admin/objectif-form.ejs`.

- Base de données : nouvelle table indépendante `objectifs` (titre, % de progression, atteint ou non) et 3 nouvelles colonnes optionnelles sur `players` (`points_forts`, `axes_amelioration`, `plan_travail`, texte libre). Autorisation donnée par l'agence. Aucune table ni donnée existante modifiée ou supprimée.
- Fiche joueur (admin) : nouvelle section "Objectifs" (ajout/modification/suppression) et 3 nouveaux champs texte libre (points forts, axes d'amélioration, plan de travail — un élément par ligne).
- L'onglet "Progression" de l'aperçu bêta affiche désormais : les objectifs en cours avec leur barre de progression réelle, les objectifs atteints, les points forts, les axes d'amélioration, le plan de travail, et l'évolution de la note sur la saison (réutilise directement les données déjà connectées à l'étape 6, sans ressaisie).
- Tant qu'une information n'est pas renseignée, un message honnête l'indique plutôt qu'une donnée inventée.
- Toujours aucune route supprimée, aucune fonctionnalité retirée, aucune donnée existante modifiée.

**Les 5 onglets du nouvel espace joueur (Profil, Matchs, Analyses, Data, Progression) sont maintenant tous connectés à de vraies données dans l'aperçu bêta.** L'espace joueur actuellement utilisé par les joueurs (`/joueur`) n'a à aucun moment été modifié ni remplacé : le remplacement ne se fera qu'après validation complète par l'agence.

### Étape 8 — Icônes de la navigation mobile de l'aperçu bêta

Fichiers modifiés : `views/admin/apercu-espace-joueur.ejs`, `public/css/apercu-joueur.css`.

- Les 5 icônes de la barre de navigation mobile en bas de l'aperçu bêta (Accueil, Matchs, Vidéos, Progression, Profil) étaient de simples cases vides : elles ont été remplacées par de vraies icônes (dessinées directement en SVG, aucune image ni police d'icônes externe), avec un léger effet lumineux vert sur l'onglet actif.
- Aucun changement de contenu, de route ou de fonctionnalité — uniquement visuel.

### Étape 9 — Lancement officiel du nouvel espace joueur + augmentation de la taille max des vidéos

Fichiers ajoutés : `src/lib/espace-joueur.js`, `views/partials/espace-joueur-corps.ejs`, `views/joueur/dashboard-ancienne-version.ejs` (ancienne page conservée, inutilisée).
Fichiers modifiés : `src/routes/admin.js`, `src/routes/player.js`, `views/admin/apercu-espace-joueur.ejs`, `views/joueur/dashboard.ejs`, `views/admin/joueur-detail.ejs`, `views/admin/rapport-form.ejs`, `views/admin/video-corrective-form.ejs`, `public/css/apercu-joueur.css`.

- **Le nouvel espace joueur (5 onglets : Profil, Matchs, Analyses, Data, Progression) est maintenant la vraie page que les joueurs voient en se connectant sur `/joueur`.** L'ancienne page (simple liste de rapports) n'a pas été supprimée : elle est conservée telle quelle dans `views/joueur/dashboard-ancienne-version.ejs`, mais n'est plus utilisée par aucune route.
- Pour garantir que l'aperçu admin et le vrai espace joueur ne puissent jamais afficher des choses différentes, tout le calcul des données (radar, évolution, objectifs, etc.) a été centralisé dans un seul fichier partagé (`src/lib/espace-joueur.js`), utilisé à la fois par la vraie page joueur et par l'aperçu admin. De même, tout l'affichage (les 5 onglets + la barre de navigation) a été extrait dans un seul gabarit partagé (`views/partials/espace-joueur-corps.ejs`), utilisé par les deux. Aucune donnée ni logique n'a été dupliquée ou réécrite : le code déjà validé aux étapes 3 à 8 a été déplacé tel quel, pas réinventé.
- Sécurité : la vraie page joueur (`/joueur`) identifie toujours le joueur uniquement via sa session de connexion, jamais via un identifiant dans l'adresse — un joueur ne peut donc techniquement jamais voir les données d'un autre joueur. Vérifié avec deux comptes joueurs de test distincts (accès à un rapport d'un autre joueur → refusé, page 404).
- L'aperçu admin (bouton "Voir comme le joueur" sur la fiche d'un joueur) est conservé tel quel comme outil permanent pour l'agence : il permet toujours de voir exactement ce qu'un joueur voit, sans avoir à se connecter à sa place, avec juste une bannière en haut de page pour le distinguer de la vraie page joueur.
- Ajout d'une icône "Réglages" (roue crantée) en haut du nouvel espace joueur, à côté de la cloche de notification, qui amène à la page "Mon compte" du joueur (changement de code, déconnexion) — cet accès n'existait pas dans la maquette d'origine puisque la nouvelle page n'a pas la même barre de navigation que le reste du site.
- Taille maximale des vidéos déposées (rapports de match et vidéos correctives) augmentée de 400 Mo à **2 Go** par fichier, à la demande de l'agence. Le message d'erreur affiché en cas de dépassement a été mis à jour en conséquence.
- Testé en profondeur (ordinateur et mobile) : connexion joueur avec changement de code obligatoire au premier accès, affichage des 5 onglets avec de vraies données (match, note radar, etc.), navigation entre les onglets (onglets du haut et barre du bas), accès à un rapport depuis le nouvel espace, icône réglages → mon compte → retour/déconnexion, aperçu admin identique au vrai espace joueur (non-régression), toutes les routes existantes de l'espace admin toujours fonctionnelles, et vérification de sécurité qu'un joueur ne peut jamais voir les données d'un autre joueur ni accéder aux pages admin. Aucune erreur rencontrée.
- Toujours aucune route supprimée, aucune fonctionnalité retirée, aucune donnée existante modifiée : l'ancienne page joueur est gardée en réserve dans le code, inutilisée mais jamais supprimée.

### Étape 10 — L'aperçu admin ne mène plus au formulaire d'édition + premier fond visuel "tableau tactique"

Fichiers ajoutés : `public/img/fond-tactique.svg`, `public/img/fond-tactique-header.svg`.
Fichiers modifiés : `src/routes/admin.js`, `views/admin/apercu-espace-joueur.ejs`, `views/partials/espace-joueur-corps.ejs`, `views/joueur/rapport-detail.ejs`, `public/css/apercu-joueur.css`.

- **Correction d'un détail signalé par l'agence** : dans l'aperçu admin ("Voir comme le joueur"), cliquer sur "Voir l'analyse" depuis l'onglet Matchs ouvrait le formulaire d'édition du rapport (normal, puisque l'agence est connectée en tant qu'admin) — mais cela ne correspondait plus à ce que l'onglet affiche par ailleurs comme étant "exactement ce que le joueur voit". Ce lien ouvre désormais une nouvelle page en lecture seule (`/admin/rapports/:id/lecture-seule`), strictement identique à ce qu'un joueur voit sur sa propre page, sans aucun champ modifiable. Pour modifier un rapport, l'agence passe toujours par la fiche du joueur comme avant — rien n'a changé de ce côté.
- Pour rappel, ce point ne concernait que l'aperçu admin : côté joueur réel, cette page a toujours été strictement en lecture seule (aucun champ modifiable), vérifié avec deux comptes de test distincts.
- **Premier habillage visuel "futuriste/tactique"** demandé par l'agence : un fond discret évoquant un tableau tactique de coach (lignes de terrain, trajectoires de passes en pointillés, points de position légèrement lumineux) a été ajouté derrière le nouvel espace joueur — un dessin en fond de page (visible surtout sur grand écran, autour de la colonne centrale) et un bandeau dédié derrière l'en-tête du profil (visible sur tous les écrans, y compris mobile). Purement décoratif, en très faible opacité pour ne jamais gêner la lecture, aucune image ni police externe utilisée (SVG dessiné à la main). Première étape d'un travail plus large d'amélioration visuelle à poursuivre.
- Testé sur ordinateur et mobile, aucune erreur, aucun impact sur les données ou les fonctionnalités existantes.

## Version de référence (avant refonte)

Point de sauvegarde correspondant à la version en ligne avant le début de la refonte (animations joueur, recadrage photo, tableau de bord avec statistiques). Commit local de sauvegarde : "backup avant refonte UI KSM LABS".
