// Connexion SQLite + création du schéma au démarrage.
// SQLite est un simple fichier sur disque : parfait pour une petite agence,
// aucune base de données séparée à gérer.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "ksmlabs.sqlite");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifiant TEXT UNIQUE NOT NULL,
  code_hash TEXT NOT NULL,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  poste TEXT,
  actif INTEGER NOT NULL DEFAULT 1,
  must_change_code INTEGER NOT NULL DEFAULT 1,
  photo_filename TEXT,
  club_nom TEXT,
  club_pays TEXT,
  club_logo_filename TEXT,
  taille_cm INTEGER,
  nb_matchs INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  date_match TEXT,
  adversaire TEXT,
  resultat TEXT,
  texte TEXT,
  stats_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  label TEXT,
  url TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  filename TEXT,
  original_name TEXT,
  mimetype TEXT
);

CREATE TABLE IF NOT EXISTS report_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  ordre INTEGER NOT NULL DEFAULT 0
);

-- Vidéos correctives (nouvel onglet "Analyses" de l'espace joueur, bêta) :
-- table entièrement nouvelle et indépendante, aucune table existante n'est
-- modifiée. Une vidéo corrective appartient toujours à un joueur et peut,
-- optionnellement, être rattachée à un match (rapport) déjà publié.
CREATE TABLE IF NOT EXISTS videos_correctives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  titre TEXT NOT NULL,
  theme TEXT NOT NULL,
  commentaire TEXT,
  duree TEXT,
  url TEXT,
  filename TEXT,
  original_name TEXT,
  mimetype TEXT,
  vu_le TEXT,
  compris_le TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Objectifs (nouvel onglet "Progression" de l'espace joueur, bêta) : table
-- entièrement nouvelle et indépendante, aucune table existante modifiée.
CREATE TABLE IF NOT EXISTS objectifs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  progression_pct INTEGER NOT NULL DEFAULT 0,
  atteint INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_player ON reports(player_id);
CREATE INDEX IF NOT EXISTS idx_videos_report ON report_videos(report_id);
CREATE INDEX IF NOT EXISTS idx_images_report ON report_images(report_id);
CREATE INDEX IF NOT EXISTS idx_videos_correctives_player ON videos_correctives(player_id);
CREATE INDEX IF NOT EXISTS idx_objectifs_player ON objectifs(player_id);
`);

// Migration légère : ajoute les colonnes manquantes sur une base déjà
// existante (ex: après une mise à jour du site déjà déployé sur Railway),
// sans jamais toucher aux données déjà présentes.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("players", "photo_filename", "TEXT");
ensureColumn("players", "club_nom", "TEXT");
ensureColumn("players", "club_pays", "TEXT");
ensureColumn("players", "club_logo_filename", "TEXT");
ensureColumn("players", "taille_cm", "INTEGER");
ensureColumn("players", "nb_matchs", "INTEGER NOT NULL DEFAULT 0");

// Champs additionnels pour le nouvel espace joueur (maquette validée) :
// simples ajouts, aucune donnée existante n'est modifiée ni supprimée.
ensureColumn("players", "numero", "INTEGER");
ensureColumn("players", "date_naissance", "TEXT");
ensureColumn("players", "nationalite", "TEXT");
ensureColumn("players", "pied_fort", "TEXT");

ensureColumn("reports", "competition", "TEXT");
ensureColumn("reports", "minutes_jouees", "INTEGER");

// Notes de performance par match (onglet "Data", bêta) : toutes optionnelles,
// alimentent le radar de compétences, la courbe d'évolution et la
// comparaison de l'aperçu bêta. Aucune donnée existante modifiée.
ensureColumn("reports", "note_globale", "REAL");
ensureColumn("reports", "duels", "REAL");
ensureColumn("reports", "passes", "REAL");
ensureColumn("reports", "vitesse", "REAL");
ensureColumn("reports", "placement", "REAL");
ensureColumn("reports", "technique", "REAL");
ensureColumn("reports", "relance", "REAL");

// Points forts / axes d'amélioration / plan de travail (onglet "Progression",
// bêta) : texte libre, une ligne = un élément. Toujours optionnels.
ensureColumn("players", "points_forts", "TEXT");
ensureColumn("players", "axes_amelioration", "TEXT");
ensureColumn("players", "plan_travail", "TEXT");

ensureColumn("report_videos", "filename", "TEXT");
ensureColumn("report_videos", "original_name", "TEXT");
ensureColumn("report_videos", "mimetype", "TEXT");

module.exports = { db, DATA_DIR, UPLOADS_DIR };
