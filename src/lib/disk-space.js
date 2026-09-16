const { execSync } = require("child_process");

// Renvoie l'espace disque (en Go) du volume qui contient `dir`, via la
// commande `df` (disponible sur les serveurs Linux, dont Railway). Sert à
// afficher un indicateur simple sur le tableau de bord admin, pour repérer
// tout de suite un stockage presque plein — cause possible d'un échec
// d'envoi de vidéo volumineuse. Renvoie null si l'info n'est pas
// disponible (ex : environnement non-Linux, commande absente).
function getDiskSpace(dir) {
  try {
    const out = execSync(`df -Pk "${dir}"`, { encoding: "utf8" });
    const lines = out.trim().split("\n");
    const parts = lines[lines.length - 1].trim().split(/\s+/);
    // Format `df -P` : Filesystem 1024-blocks Used Available Capacity Mounted-on
    const totalKb = parseInt(parts[1], 10);
    const usedKb = parseInt(parts[2], 10);
    const availKb = parseInt(parts[3], 10);
    if (![totalKb, usedKb, availKb].every(Number.isFinite)) return null;

    const toGo = (kb) => Math.round((kb / (1024 * 1024)) * 10) / 10;
    const percentUsed = totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : null;

    return {
      totalGo: toGo(totalKb),
      usedGo: toGo(usedKb),
      availGo: toGo(availKb),
      percentUsed,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { getDiskSpace };
