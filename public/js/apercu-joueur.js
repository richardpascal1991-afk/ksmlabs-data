// Aperçu (bêta) du nouvel espace joueur : navigation par onglets, purement
// visuelle (aucune donnée envoyée au serveur).
(function () {
  var tabs = document.querySelectorAll(".p-tab");
  var panels = document.querySelectorAll(".tab-panel");
  var bLinks = document.querySelectorAll(".b-link");

  function activate(name) {
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === name);
    });
    panels.forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    bLinks.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-target") === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      activate(t.getAttribute("data-tab"));
    });
  });
  bLinks.forEach(function (b) {
    b.addEventListener("click", function () {
      activate(b.getAttribute("data-target"));
    });
  });
})();
