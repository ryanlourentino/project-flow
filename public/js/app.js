// Small browser-side helpers for every page (loaded in views/layouts/main.hbs, after HTMX).

// Success messages (green alerts, and small messages marked "autohide" such as "Added to cart")
// fade out and disappear by themselves after 5 seconds.
// htmx.onLoad runs once for the whole page when it opens, and again for every piece of HTML
// that HTMX swaps in later (that is where new messages come from after Save, Delete, ...).
(function () {
  const HIDE_AFTER_MS = 5000;  // 5 seconds
  const FADE_MS = 600;         // must match the transition time in style.css

  function hideLater(alert) {
    if (alert.dataset.autohide) return; // already scheduled
    alert.dataset.autohide = 'on';
    setTimeout(() => {
      alert.classList.add('alert-fading');            // CSS fades it out
      setTimeout(() => alert.remove(), FADE_MS);      // then remove it, so the page moves up
    }, HIDE_AFTER_MS);
  }

  const SELECTOR = '.alert-success, .autohide';
  htmx.onLoad((root) => {
    if (root.matches && root.matches(SELECTOR)) hideLater(root);
    root.querySelectorAll(SELECTOR).forEach(hideLater);
  });
})();