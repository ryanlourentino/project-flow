// Small browser-side helpers for every page (loaded in views/layouts/main.hbs, after HTMX).

// 1. Messages disappear by themselves: green success messages after 5 seconds, red error messages after
//    8 seconds (a little longer, so there is time to read what went wrong). This covers the alert boxes and
//    the small messages next to a button, such as "Added to cart" (class autohide / autohide-error).
//    htmx.onLoad runs once for the whole page when it opens, and again for every piece of HTML
//    that HTMX swaps in later (that is where new messages come from after Save, Delete, ...).
(function () {
  const FADE_MS = 600; // must match the transition time in style.css
  const RULES = [
    { selector: '.alert-success, .autohide', hideAfterMs: 5000 },
    { selector: '.alert-danger, .autohide-error', hideAfterMs: 8000 },
  ];

  function hideLater(message, hideAfterMs) {
    if (message.dataset.autohide) return; // already scheduled
    message.dataset.autohide = 'on';
    setTimeout(() => {
      message.classList.add('alert-fading');             // CSS fades it out
      setTimeout(() => message.remove(), FADE_MS);       // then remove it, so the page moves up
    }, hideAfterMs);
  }

  htmx.onLoad((root) => {
    for (const rule of RULES) {
      if (root.matches && root.matches(rule.selector)) hideLater(root, rule.hideAfterMs);
      root.querySelectorAll(rule.selector).forEach((el) => hideLater(el, rule.hideAfterMs));
    }
  });
})();

// 2. Rental dates: when the start date changes, the end date can't be earlier any more.
//    If the end date is now before the start, it moves to the start date (a 1-day rental).
//    Works for the product page and the cart (rent_start / rent_end) and the checkout (start_<id> / end_<id>).
//    "true" = capture: this runs before HTMX sends the change, so the request already has the new end date.
document.addEventListener('change', (event) => {
  const start = event.target;
  if (!start.matches || !start.matches('input[type=date][name=rent_start], input[type=date][name^="start_"]')) return;
  const box = start.closest('form, tr, li');
  const end = box && box.querySelector('input[type=date][name=rent_end], input[type=date][name^="end_"]');
  if (!end || !start.value) return;
  end.min = start.value;                                 // the date picker greys out earlier days
  if (!end.value || end.value < start.value) end.value = start.value;
}, true);
