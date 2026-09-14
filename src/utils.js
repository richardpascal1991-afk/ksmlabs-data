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

function formatDateFr(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

module.exports = { generateAccessCode, slugifyIdentifiant, getEmbeddableVideo, formatDateFr };
