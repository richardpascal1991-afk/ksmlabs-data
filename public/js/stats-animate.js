// Anime les chiffres (comptage progressif) et les barres de statistiques
// ("data-countup" / "data-bar-target") quand ils entrent dans l'écran.
(function () {
  function animateCountUp(el) {
    const target = parseFloat(el.getAttribute("data-countup"));
    if (Number.isNaN(target)) return;
    const decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    const suffix = el.getAttribute("data-suffix") || "";
    const duration = 900;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(tick);
  }

  function animateBar(el) {
    const target = parseFloat(el.getAttribute("data-bar-target") || "0");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.width = target + "%";
      });
    });
  }

  function trigger(el) {
    if (el.hasAttribute("data-countup")) animateCountUp(el);
    if (el.hasAttribute("data-bar-target")) animateBar(el);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const targets = document.querySelectorAll("[data-countup], [data-bar-target]");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              trigger(entry.target);
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );
      targets.forEach((el) => io.observe(el));
    } else {
      targets.forEach(trigger);
    }
  });
})();
