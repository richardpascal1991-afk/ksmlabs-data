// Calcule toutes les données affichées dans le nouvel espace joueur (les 5
// onglets : Profil, Matchs, Analyses, Data, Progression).
//
// Ce fichier est le SEUL endroit où cette logique existe : il est utilisé à
// la fois par l'aperçu admin (/admin/joueurs/:id/apercu-espace-joueur, qui
// permet à l'agence de voir exactement ce qu'un joueur voit) et par la vraie
// page joueur (/joueur). Centraliser ce calcul ici évite que les deux
// versions puissent un jour afficher des choses différentes.

const { db } = require("../db");
const { formatDateFr, getEmbeddableVideo } = require("../utils");

function calculerAge(dateNaissance) {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance.getTime())) return null;
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - naissance.getFullYear();
  const pasEncoreAnniversaire =
    aujourdhui.getMonth() < naissance.getMonth() ||
    (aujourdhui.getMonth() === naissance.getMonth() && aujourdhui.getDate() < naissance.getDate());
  if (pasEncoreAnniversaire) age--;
  return age;
}

const AXES_RADAR = [
  { key: "duels", label: "Duels" },
  { key: "passes", label: "Passes" },
  { key: "vitesse", label: "Vitesse" },
  { key: "placement", label: "Placement" },
  { key: "technique", label: "Technique" },
  { key: "relance", label: "Relance" },
];

function formatNoteFr(n) {
  return n.toFixed(1).replace(".", ",");
}

// Calcule les points SVG d'un radar régulier à N axes (centre 110,100,
// rayon 86 — mêmes proportions que la maquette validée), sans dépendre
// d'une librairie externe.
function radarGeometry(axesValues) {
  const cx = 110;
  const cy = 100;
  const maxR = 86;
  const n = axesValues.length;
  const angleFor = (i) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pointAt = (i, r) => {
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const grid = [1, 0.66, 0.33].map((level) =>
    axesValues
      .map((_, i) => pointAt(i, maxR * level))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ")
  );
  const axisLines = axesValues.map((_, i) => {
    const p = pointAt(i, maxR);
    return { x1: cx, y1: cy, x2: p.x.toFixed(1), y2: p.y.toFixed(1) };
  });
  const dataPoints = axesValues
    .map((a, i) => pointAt(i, (Math.max(0, Math.min(10, a.value)) / 10) * maxR))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const labels = axesValues.map((a, i) => {
    const p = pointAt(i, maxR + 14);
    let anchor = "middle";
    if (p.x > cx + 5) anchor = "start";
    else if (p.x < cx - 5) anchor = "end";
    return { text: a.label, x: p.x.toFixed(1), y: p.y.toFixed(1), anchor };
  });
  return { grid, axisLines, dataPoints, labels };
}

const splitLignes = (texte) =>
  (texte || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

/**
 * @param {object} player - la ligne complète de la table players.
 * @returns {object} toutes les variables attendues par la vue partagée
 *   views/partials/espace-joueur-corps.ejs
 */
function buildEspaceJoueurData(player) {
  const dernierRapport = db
    .prepare("SELECT created_at FROM reports WHERE player_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(player.id);

  const rapportsBruts = db
    .prepare("SELECT * FROM reports WHERE player_id = ? ORDER BY date_match DESC, created_at DESC")
    .all(player.id);
  const matchs = rapportsBruts.map((r) => ({
    id: r.id,
    dateFr: r.date_match ? formatDateFr(r.date_match) : "Date non renseignée",
    adversaire: r.adversaire || "Adversaire non renseigné",
    competition: r.competition || null,
    resultat: r.resultat || null,
    minutesJouees: r.minutes_jouees || null,
  }));

  const videosBrutes = db
    .prepare("SELECT * FROM videos_correctives WHERE player_id = ? ORDER BY created_at DESC")
    .all(player.id);
  const analyses = videosBrutes.map((v) => {
    const rapportLie = v.report_id ? rapportsBruts.find((r) => r.id === v.report_id) : null;
    return {
      id: v.id,
      titre: v.titre,
      theme: v.theme,
      commentaire: v.commentaire || "",
      duree: v.duree || null,
      matchLabel: rapportLie
        ? (rapportLie.adversaire ? "vs " + rapportLie.adversaire : rapportLie.titre)
        : null,
      videoSrc: v.filename ? `/media/video-corrective/${v.id}` : null,
      embedUrl: !v.filename && v.url ? getEmbeddableVideo(v.url) : null,
      lienExterne: !v.filename && v.url && !getEmbeddableVideo(v.url) ? v.url : null,
      nouveau: !v.vu_le,
      createdFr: formatDateFr(v.created_at),
    };
  });

  // ---- Onglet Data : radar, courbe d'évolution, comparaison ----
  // rapportsBruts est trié du plus récent au plus ancien.

  let radar = null;
  const radarReport = rapportsBruts.find((r) => AXES_RADAR.every((a) => r[a.key] !== null && r[a.key] !== undefined));
  if (radarReport) {
    radar = {
      geometry: radarGeometry(AXES_RADAR.map((a) => ({ label: a.label, value: radarReport[a.key] }))),
      dateFr: radarReport.date_match ? formatDateFr(radarReport.date_match) : formatDateFr(radarReport.created_at),
    };
  }

  const matchsAvecNote = rapportsBruts
    .filter((r) => r.note_globale !== null && r.note_globale !== undefined)
    .slice(0, 5)
    .slice()
    .reverse();

  let evolution = null;
  if (matchsAvecNote.length >= 2) {
    const stepX = 300 / (matchsAvecNote.length - 1);
    const toY = (v) => 84 - (Math.max(0, Math.min(10, v)) / 10) * 78;
    const polylinePoints = matchsAvecNote
      .map((r, i) => `${(i * stepX).toFixed(1)},${toY(r.note_globale).toFixed(1)}`)
      .join(" ");
    evolution = {
      polylinePoints,
      count: matchsAvecNote.length,
      premiereFr: formatNoteFr(matchsAvecNote[0].note_globale),
      derniereFr: formatNoteFr(matchsAvecNote[matchsAvecNote.length - 1].note_globale),
    };
  }

  const comparaison = AXES_RADAR.map((a) => {
    const valeurs = rapportsBruts.filter((r) => r[a.key] !== null && r[a.key] !== undefined);
    if (valeurs.length < 2) return null;
    const latest = valeurs[0][a.key];
    const moyenne = valeurs.reduce((sum, r) => sum + r[a.key], 0) / valeurs.length;
    const diff = latest - moyenne;
    let tendance = "flat";
    if (diff > 0.3) tendance = "up";
    else if (diff < -0.3) tendance = "down";
    return { label: a.label, latestFr: formatNoteFr(latest), moyenneFr: formatNoteFr(moyenne), tendance };
  }).filter(Boolean);

  // ---- Onglet Progression : objectifs, points forts, axes, plan de travail ----

  const objectifsBruts = db
    .prepare("SELECT * FROM objectifs WHERE player_id = ? ORDER BY created_at DESC")
    .all(player.id);
  const objectifsActuels = objectifsBruts.filter((o) => !o.atteint);
  const objectifsAtteints = objectifsBruts.filter((o) => o.atteint);

  const pointsForts = splitLignes(player.points_forts);
  const axesAmelioration = splitLignes(player.axes_amelioration);
  const planTravail = splitLignes(player.plan_travail);

  return {
    player,
    age: calculerAge(player.date_naissance),
    dateNaissanceFr: player.date_naissance ? formatDateFr(player.date_naissance) : null,
    dernierRapportFr: dernierRapport ? formatDateFr(dernierRapport.created_at) : null,
    matchs,
    analyses,
    radar,
    evolution,
    comparaison: comparaison.length ? comparaison : null,
    objectifsActuels,
    objectifsAtteints,
    pointsForts,
    axesAmelioration,
    planTravail,
  };
}

module.exports = { buildEspaceJoueurData };
