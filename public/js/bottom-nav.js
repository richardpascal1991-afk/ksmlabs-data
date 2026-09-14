// Met en évidence l'onglet actif du menu mobile (bas d'écran, espace admin).
// N'a aucun effet si le menu n'est pas présent sur la page (ex : desktop).
(function () {
  var nav = document.querySelector("[data-bottom-nav]");
  if (!nav) return;

  var path = window.location.pathname;
  var links = nav.querySelectorAll("a[data-nav-match]");
  var best = null;

  links.forEach(function (a) {
    var match = a.getAttribute("data-nav-match");
    var isMatch = match === "/admin" ? path === match : path.indexOf(match) === 0;
    if (isMatch && (!best || match.length > best.getAttribute("data-nav-match").length)) {
      best = a;
    }
  });

  if (best) best.classList.add("active");
})();
