// Affiche une barre de progression pendant l'envoi des formulaires marqués
// data-upload-progress (dépôt de vidéos, potentiellement volumineuses —
// jusqu'à 2 Go — pendant lequel la page semblait figée sans ce script).
// Si un fichier est sélectionné, l'envoi passe par XMLHttpRequest (pour
// suivre la progression réelle) puis redirige exactement comme un envoi de
// formulaire classique. Sans fichier sélectionné, ou si JavaScript est
// indisponible, le formulaire s'envoie normalement — aucune perte de
// fonctionnalité.
(function () {
  function humanSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " Go";
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " Ko";
    return bytes + " o";
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "upload-overlay";
    overlay.innerHTML =
      '<div class="upload-modal">' +
      '<div class="upload-spinner"></div>' +
      "<h3>Envoi en cours…</h3>" +
      '<div class="upload-bar-track"><div class="upload-bar-fill" style="width:0%"></div></div>' +
      '<p class="upload-status">Préparation de l’envoi…</p>' +
      '<p class="card-meta upload-hint">Ne ferme pas cette page et ne quitte pas l’application tant que l’envoi n’est pas terminé.</p>' +
      "</div>";
    document.body.appendChild(overlay);
    return {
      overlay,
      fill: overlay.querySelector(".upload-bar-fill"),
      status: overlay.querySelector(".upload-status"),
    };
  }

  function attach(form) {
    form.addEventListener("submit", (e) => {
      const fileInputs = Array.from(form.querySelectorAll('input[type="file"]'));
      const hasFile = fileInputs.some((input) => input.files && input.files.length > 0);
      if (!hasFile) return; // Rien à téléverser : envoi normal, pas de barre.

      e.preventDefault();

      const submitButtons = form.querySelectorAll('button[type="submit"]');
      submitButtons.forEach((btn) => (btn.disabled = true));

      const { overlay, fill, status } = buildOverlay();
      const totalSize = fileInputs.reduce(
        (sum, input) => sum + Array.from(input.files || []).reduce((s, f) => s + f.size, 0),
        0
      );
      status.textContent = "0 % — 0 o sur " + humanSize(totalSize);

      const xhr = new XMLHttpRequest();
      xhr.open(form.method || "POST", form.action);

      xhr.upload.addEventListener("progress", (evt) => {
        if (!evt.lengthComputable) return;
        const pct = Math.round((evt.loaded / evt.total) * 100);
        fill.style.width = pct + "%";
        status.textContent = pct + " % — " + humanSize(evt.loaded) + " sur " + humanSize(evt.total);
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 400) {
          fill.style.width = "100%";
          status.textContent = "Terminé, redirection…";
          // On navigue vers l'URL de succès connue à l'avance (attribut
          // data-success-redirect) plutôt que de suivre xhr.responseURL :
          // ça évite de dépendre de la redirection interne suivie par le
          // navigateur pour la requête XHR elle-même.
          window.location = form.dataset.successRedirect || xhr.responseURL || form.action;
        } else {
          // Le serveur a répondu avec une erreur (ex : fichier trop
          // volumineux) : on affiche sa page, qui contient le message
          // d'erreur exact, avec le formulaire pré-rempli.
          document.open();
          document.write(xhr.responseText);
          document.close();
        }
      });

      xhr.addEventListener("error", () => {
        overlay.classList.add("upload-error");
        status.textContent = "L'envoi a échoué (connexion interrompue). Réessaie.";
        submitButtons.forEach((btn) => (btn.disabled = false));
        setTimeout(() => overlay.remove(), 4000);
      });

      xhr.send(new FormData(form));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-upload-progress]").forEach(attach);
  });
})();
