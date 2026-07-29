// Auto-rotating fade between the home hero photos declared in config.toml's
// [[Params.bigimg]]. Deliberately no dot navigation / click controls — see
// docs/superpowers/specs/2026-07-28-main-site-design-system-alignment-design.md
// Plain vanilla JS, no jQuery dependency, so it has nothing else to load first.
(function () {
  var ROTATE_MS = 6000;

  function start() {
    var slides = document.querySelectorAll('.home-hero-slide');
    if (slides.length < 2) {
      return;
    }
    var current = 0;
    setInterval(function () {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, ROTATE_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
