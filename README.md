# KSMLABS — Plateforme d'analyse vidéo

Site avec deux espaces :
- **Espace agence** (toi) : tu crées les fiches joueurs et tu publies leurs rapports (texte, statistiques, liens vidéo Hudl/SportsCode/YouTube, images ou PDF exportés depuis Canva).
- **Espace joueur** : chaque joueur se connecte avec un identifiant + un code d'accès personnel et ne voit **que ses propres rapports**.

C'est une vraie application web (avec sa propre base de données), pas une simple page : elle doit être hébergée quelque part pour être accessible depuis un navigateur, par toi et par les joueurs. Ce guide t'explique comment la mettre en ligne **sans avoir besoin de compétences techniques**, avec l'hébergeur [Railway](https://railway.app) (gratuit pour commencer, quelques dollars par mois ensuite selon l'usage).

---

## 1. Mettre le code sur GitHub (sans ligne de commande)

1. Crée un compte gratuit sur [github.com](https://github.com).
2. Clique sur **"New repository"**, donne-lui un nom (ex : `ksmlabs-site`), laisse-le en **Private**, puis **Create repository**.
3. Sur la page du nouveau dépôt, clique sur **"uploading an existing file"** (ou "Add file" → "Upload files").
4. Décompresse le dossier `ksmlabs-analyse-video` que je t'ai fourni, puis fais glisser **tout son contenu** (pas le dossier lui-même, son contenu) dans la zone d'upload de GitHub.
5. Clique sur **"Commit changes"** en bas de page.

## 2. Déployer sur Railway

1. Va sur [railway.app](https://railway.app) et connecte-toi avec ton compte GitHub.
2. Clique **"New Project"** → **"Deploy from GitHub repo"** → choisis le dépôt que tu viens de créer.
3. Railway détecte automatiquement qu'il s'agit d'une application Node.js et l'installe. Le premier déploiement peut échouer, c'est normal : il manque encore les réglages ci-dessous.

### Ajouter un espace de stockage permanent (indispensable)

Le site stocke ses données (joueurs, rapports, images) dans un dossier `data/`. Sans réglage particulier, cet hébergeur efface ce dossier à chaque nouveau déploiement — il faut donc lui dire de le conserver :

1. Dans ton projet Railway, ouvre l'onglet **"Settings"** du service, section **"Volumes"**.
2. Clique **"+ New Volume"**.
3. Mets comme **"Mount path"** : `/app/data`
4. Sauvegarde.

### Ajouter les variables d'environnement

Toujours dans les réglages du service, onglet **"Variables"**, ajoute (bouton "+ New Variable") :

| Nom | Valeur |
|---|---|
| `AGENCY_NAME` | `KSMLABS` |
| `SESSION_SECRET` | une longue chaîne aléatoire (30+ caractères) — utilise un générateur de mot de passe en ligne |
| `COOKIE_SECURE` | `true` |
| `ADMIN_USERNAME` | l'identifiant que tu veux pour te connecter à l'espace agence |
| `ADMIN_PASSWORD` | un mot de passe d'au moins 8 caractères |

Railway redéploie automatiquement après l'ajout des variables. Ton compte administrateur est créé tout seul au premier démarrage grâce à `ADMIN_USERNAME` / `ADMIN_PASSWORD` — tu n'as **aucune commande à lancer**.

> Une fois connecté la première fois (étape 3), tu peux retirer `ADMIN_PASSWORD` des variables si tu préfères, ou simplement changer le mot de passe depuis le site dans "Mon compte" — la variable ne sert qu'à la toute première création.

### Récupérer l'adresse du site

Dans l'onglet **"Settings" → "Networking"**, clique **"Generate Domain"**. Railway te donne une adresse du style `https://ksmlabs-site-production.up.railway.app` — c'est l'adresse à partager avec les joueurs et à utiliser toi-même.

## 3. Première connexion

1. Ouvre l'adresse du site → **"Espace agence"**.
2. Connecte-toi avec `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. Va dans **"Joueurs" → "+ Ajouter un joueur"**. Un identifiant et un code à 6 chiffres sont générés automatiquement et affichés **une seule fois** — note-les et transmets-les au joueur en main propre (SMS, message privé — jamais par un canal public).
4. Depuis la fiche du joueur, clique **"+ Nouveau rapport"** pour ajouter un rapport : titre, date de match, adversaire, texte d'analyse, statistiques (lignes libres), liens vidéo, et images/PDF (tes exports Canva par exemple).

Le joueur se connecte de son côté sur **"Espace joueur"** avec son identifiant et son code, et ne voit que ses propres rapports.

## 4. Notes importantes

- **Les liens YouTube** sont intégrés directement dans la page. **Les liens Hudl, SportsCode, Wyscout, InStat** etc. s'ouvrent dans un nouvel onglet (ces plateformes ne permettent pas d'intégrer la vidéo ailleurs).
- **Images/PDF** : formats acceptés PNG, JPG, WEBP, PDF — 15 Mo max par fichier.
- **Sécurité** : les mots de passe/codes sont chiffrés (jamais stockés en clair), les tentatives de connexion sont limitées contre le bruteforce, et un joueur ne peut techniquement pas accéder aux rapports d'un autre joueur (vérifié côté serveur, pas seulement caché dans l'interface).
- **Sauvegardes** : pense à exporter régulièrement le volume Railway (ou passer sur une base gérée) si les rapports deviennent critiques pour l'agence — un plan gratuit reste un plan gratuit.
- Pour désactiver l'accès d'un joueur sans supprimer ses rapports (fin de contrat, etc.), décoche "Compte actif" sur sa fiche.

## 5. Développement local (optionnel, si tu veux tester avant de déployer)

Nécessite [Node.js](https://nodejs.org) installé (version 18 ou plus).

```bash
npm install
cp .env.example .env
# édite .env avec un éditeur de texte si besoin
npm run seed:admin   # crée ton compte admin en local (si tu n'as pas mis ADMIN_USERNAME/PASSWORD dans .env)
npm start
```

Le site est alors accessible sur `http://localhost:3000`.

## 6. Personnaliser les couleurs / le nom

- Le nom affiché vient de la variable `AGENCY_NAME`.
- Les couleurs se règlent dans `public/css/style.css`, tout en haut du fichier (`--accent`, `--bg`, etc.). Donne-moi tes couleurs de marque si tu veux que je les intègre directement.
