const crypto = require("crypto");

/** Génère un code numérique à 6 chiffres, facile à communiquer oralement. */
function generateAccessCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

/** Transforme "Jean" "Dupont" en identifiant "jean.dupont" (+ suffixe si besoin). */
function slugifyIdentifiant(prenom, nom) {
  const clean = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  const base = `${clean(prenom)}.${clean(nom)}`;
  return base.replace(/^\.+|\.+$/g, "") || "joueur";
}

/**
 * Reconnaît un lien YouTube et renvoie une URL d'intégration (iframe).
 * Les liens Hudl / SportsCode / Wyscout etc. ne sont pas "embeddables"
 * (ils nécessitent une connexion sur leur propre plateforme) : on les
 * affiche alors comme un simple lien à ouvrir dans un nouvel onglet.
 */
function getEmbeddableVideo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shortsMatch = u.pathname.match(/^\/shorts\/([\w-]+)/);
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Enrichit les statistiques libres (label + valeur texte) pour un affichage
 * "façon data" côté joueur : détecte la partie numérique en tête de la
 * valeur (ex : "10,4 km" -> 10.4 + " km") pour permettre une animation de
 * comptage, et calcule une largeur de barre relative au sein du même
 * rapport (proportionnelle à la plus grande valeur numérique du rapport —
 * on n'invente jamais d'échelle absolue).
 */
function enrichStatsForDisplay(stats) {
  const parsed = (stats || []).map((s) => {
    const raw = String(s.value == null ? "" : s.value).trim();
    const m = raw.match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m) return { ...s, numeric: false };
    const numStr = m[1].replace(",", ".");
    const num = parseFloat(numStr);
    if (Number.isNaN(num) || num < 0) return { ...s, numeric: false };
    const decimalsPart = m[1].split(/[.,]/)[1];
    return {
      ...s,
      numeric: true,
      num,
      decimals: decimalsPart ? decimalsPart.length : 0,
      suffix: m[2] ? ` ${m[2]}` : "",
    };
  });

  const max = parsed.reduce((acc, s) => (s.numeric && s.num > acc ? s.num : acc), 0);

  return parsed.map((s) =>
    s.numeric ? { ...s, pct: max > 0 ? Math.max(4, Math.round((s.num / max) * 100)) : 0 } : s
  );
}

function formatDateFr(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

module.exports = {
  generateAccessCode,
  slugifyIdentifiant,
  getEmbeddableVideo,
  formatDateFr,
  enrichStatsForDisplay,
};
