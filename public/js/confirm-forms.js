// Ajoute une confirmation avant l'envoi des formulaires marqués
// data-confirm="message" (suppression de rapport, de joueur...).
// Fichier externe requis par la politique de sécurité du site (CSP), qui
// interdit les attributs onsubmit="" inline.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      if (!window.confirm(form.getAttribute("data-confirm"))) {
        e.preventDefault();
      }
    });
  });
});
