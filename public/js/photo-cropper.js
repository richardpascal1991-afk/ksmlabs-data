// Outil de recadrage + zoom (façon Instagram) pour la photo du joueur.
// S'active sur tout <input type="file" data-cropper> : au choix d'une
// image, une fenêtre s'ouvre pour zoomer/déplacer l'image dans un cadre
// carré avant de valider. Le fichier recadré remplace le fichier original
// dans l'input (via DataTransfer), donc le reste du formulaire et l'envoi
// au serveur ne changent pas.
(function () {
  const VIEW_SIZE = 280; // taille du cadre affiché à l'écran (px)
  const OUTPUT_SIZE = 480; // taille de l'image exportée (px, carrée)
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;

  function attach(input) {
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file || !/^image\//.test(file.type)) return;
      const reader = new FileReader();
      reader.onload = () => openCropper(input, reader.result);
      reader.readAsDataURL(file);
    });
  }

  function openCropper(input, dataUrl) {
    const overlay = document.createElement("div");
    overlay.className = "cropper-overlay";
    overlay.innerHTML =
      '<div class="cropper-modal">' +
      "<h3>Ajuster la photo</h3>" +
      '<p class="card-meta" style="margin:0 0 12px;">Fais glisser l’image pour la repositionner, utilise le curseur pour zoomer.</p>' +
      '<div class="cropper-canvas-wrap"><canvas class="cropper-canvas" width="' +
      VIEW_SIZE +
      '" height="' +
      VIEW_SIZE +
      '"></canvas></div>' +
      '<input type="range" class="cropper-zoom" min="' +
      MIN_ZOOM +
      '" max="' +
      MAX_ZOOM +
      '" step="0.01" value="' +
      MIN_ZOOM +
      '" />' +
      '<div class="cropper-actions">' +
      '<button type="button" class="btn btn-secondary btn-small cropper-cancel">Annuler</button>' +
      '<button type="button" class="btn btn-small cropper-confirm">Valider ce recadrage</button>' +
      "</div></div>";
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector(".cropper-canvas");
    const ctx = canvas.getContext("2d");
    const zoomInput = overlay.querySelector(".cropper-zoom");
    const cancelBtn = overlay.querySelector(".cropper-cancel");
    const confirmBtn = overlay.querySelector(".cropper-confirm");

    const img = new Image();
    let scaleBase = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    img.onload = () => {
      scaleBase = Math.max(VIEW_SIZE / img.width, VIEW_SIZE / img.height);
      scale = scaleBase;
      draw();
    };
    img.src = dataUrl;

    function draw() {
      ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (VIEW_SIZE - w) / 2 + offsetX;
      const y = (VIEW_SIZE - h) / 2 + offsetY;
      ctx.drawImage(img, x, y, w, h);
    }

    function clampOffsets() {
      const w = img.width * scale;
      const h = img.height * scale;
      const maxX = Math.max(0, (w - VIEW_SIZE) / 2);
      const maxY = Math.max(0, (h - VIEW_SIZE) / 2);
      offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
      offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
    }

    function pointerDown(x, y) {
      dragging = true;
      lastX = x;
      lastY = y;
    }
    function pointerMove(x, y) {
      if (!dragging) return;
      offsetX += x - lastX;
      offsetY += y - lastY;
      lastX = x;
      lastY = y;
      clampOffsets();
      draw();
    }
    function pointerUp() {
      dragging = false;
    }

    canvas.addEventListener("mousedown", (e) => pointerDown(e.offsetX, e.offsetY));
    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      pointerMove(e.clientX - rect.left, e.clientY - rect.top);
    });
    window.addEventListener("mouseup", pointerUp);

    canvas.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        pointerDown(t.clientX - rect.left, t.clientY - rect.top);
      },
      { passive: true }
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        pointerMove(t.clientX - rect.left, t.clientY - rect.top);
        e.preventDefault();
      },
      { passive: false }
    );
    canvas.addEventListener("touchend", pointerUp);

    zoomInput.addEventListener("input", () => {
      scale = scaleBase * parseFloat(zoomInput.value);
      clampOffsets();
      draw();
    });

    function close() {
      overlay.remove();
    }

    cancelBtn.addEventListener("click", () => {
      input.value = "";
      close();
    });

    confirmBtn.addEventListener("click", () => {
      const outCanvas = document.createElement("canvas");
      outCanvas.width = OUTPUT_SIZE;
      outCanvas.height = OUTPUT_SIZE;
      const outCtx = outCanvas.getContext("2d");
      const ratio = OUTPUT_SIZE / VIEW_SIZE;
      const w = img.width * scale * ratio;
      const h = img.height * scale * ratio;
      const x = (OUTPUT_SIZE - w) / 2 + offsetX * ratio;
      const y = (OUTPUT_SIZE - h) / 2 + offsetY * ratio;
      outCtx.drawImage(img, x, y, w, h);

      outCanvas.toBlob(
        (blob) => {
          if (!blob) {
            close();
            return;
          }
          try {
            const croppedFile = new File([blob], "photo.jpg", { type: "image/jpeg" });
            const dt = new DataTransfer();
            dt.items.add(croppedFile);
            input.files = dt.files;
          } catch (e) {
            // Navigateur trop ancien pour DataTransfer : on garde le
            // fichier original tel quel, l'envoi du formulaire fonctionne
            // toujours (simplement sans le recadrage).
          }
          const previewSelector = input.getAttribute("data-cropper-preview");
          if (previewSelector) {
            const previewEl = document.querySelector(previewSelector);
            if (previewEl) {
              previewEl.src = URL.createObjectURL(blob);
              previewEl.style.display = "block";
            }
          }
          close();
        },
        "image/jpeg",
        0.9
      );
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('input[type="file"][data-cropper]').forEach(attach);
  });
})();
