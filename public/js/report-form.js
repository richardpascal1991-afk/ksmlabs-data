// Ajoute dynamiquement une ligne de statistique ou de lien vidéo dans le
// formulaire de rapport. Séparé en fichier externe (au lieu d'un
// onclick="") car la politique de sécurité du site (CSP) interdit le
// JavaScript inline.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-add-row]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const container = document.getElementById(btn.dataset.container);
      if (!container) return;
      const rows = container.querySelectorAll("." + btn.dataset.rowClass);
      const last = rows[rows.length - 1];
      if (!last) return;
      const clone = last.cloneNode(true);
      clone.querySelectorAll("input").forEach((i) => (i.value = ""));
      container.appendChild(clone);
    });
  });
});
