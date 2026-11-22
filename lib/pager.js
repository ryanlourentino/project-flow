// Page numbers for long tables (My Products, Admin pages).

const PAGE_WINDOW = 3; // page-number buttons shown at once (e.g. 1 2 3)

// The page to show: a whole number from 1 to totalPages (anything else typed in the URL becomes 1 or the last page).
function pageNumber(rawPage, totalPages) {
  return Math.min(Math.max(1, Number.parseInt(rawPage, 10) || 1), totalPages);
}

// The page-number buttons: at most PAGE_WINDOW numbers around the current page,
// plus first / previous / next / last. Returns null when everything fits on one page.
function buildPager(page, totalPages) {
  if (totalPages <= 1) return null;
  let start = Math.max(1, page - Math.floor(PAGE_WINDOW / 2));
  const end = Math.min(totalPages, start + PAGE_WINDOW - 1);
  start = Math.max(1, end - PAGE_WINDOW + 1); // near the last page, keep the window full
  const numbers = [];
  for (let n = start; n <= end; n++) numbers.push({ number: n, current: n === page });
  return {
    numbers,
    first: 1,
    prev: page - 1,
    next: page + 1,
    last: totalPages,
    atStart: page === 1,
    atEnd: page === totalPages,
  };
}

// A search text for LIKE: at most 100 characters; % and _ (LIKE wildcards) made normal characters.
function searchPattern(rawQuery) {
  const q = String(rawQuery ?? '').trim().slice(0, 100);
  return { q, like: `%${q.replace(/[\\%_]/g, '\\$&')}%` };
}

module.exports = { pageNumber, buildPager, searchPattern };
