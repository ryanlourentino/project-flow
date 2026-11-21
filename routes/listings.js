// Listings: a Supplier's or Rental partner's own offers (catalog item + own price + stock).
// app.js only lets Suppliers and Rentals in, so req.user is always a seller here.
const express = require('express');
const db = require('../db');

const router = express.Router();
const STOCK_MAX = 1000000; // largest stock or minimum order
const LEAD_MAX = 365;      // longest lead time in days
const DESC_MAX = 500;      // Listings.description is VARCHAR(500)
const PAGE_SIZE = 10;      // listings per page
const PAGE_WINDOW = 3;     // page-number buttons shown at once (e.g. 1 2 3)
const LIMITS = { stockMax: STOCK_MAX, leadMax: LEAD_MAX, descMax: DESC_MAX }; // for the inputs' max/maxlength

// Runs before every route in this file: tells the views whether prices are per day.
router.use((req, res, next) => {
  res.locals.isRental = req.user.account_type === 'Rental';
  next();
});

// Suppliers list materials (is_rentable = 0), Rental partners list equipment (is_rentable = 1).
const rentableFor = (user) => (user.account_type === 'Rental' ? 1 : 0);

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

// READ: one page of the seller's listings, optionally filtered by a search text.
// edit = { id, values }: show that listing as an edit form (values = what the seller typed, after an error).
async function loadResults(sellerId, rawQuery, rawPage, edit = {}) {
  const q = String(rawQuery ?? '').trim().slice(0, 100);
  // In LIKE, % and _ are wildcards; a backslash makes them normal characters.
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  // The same filter is used for counting and for loading. An empty search (? = '') matches everything.
  const from = `FROM Listings l
       JOIN Items i      ON i.item_id = l.item_id
       JOIN Categories c ON c.category_id = i.category_id
      WHERE l.seller_id = ?
        AND (? = '' OR i.item_name LIKE ? OR c.category_name LIKE ? OR l.description LIKE ?)`;
  const params = [sellerId, q, like, like, like];

  const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM Listings WHERE seller_id = ?', [sellerId]);
  const [[{ matches }]] = await db.execute(`SELECT COUNT(*) AS matches ${from}`, params);

  const totalPages = Math.max(1, Math.ceil(Number(matches) / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(rawPage, 10) || 1), totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // PAGE_SIZE and offset are numbers computed here (never text from the user),
  // so they can be written into the SQL directly.
  const [listings] = await db.execute(
    `SELECT l.listing_id, l.price, l.stock, l.min_order, l.lead_days, l.description,
            i.item_name, i.unit, i.avg_price, c.category_name
       ${from}
      ORDER BY i.item_name
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  );

  return {
    q,
    page,
    listings: listings.map((l) => {
      if (l.listing_id !== edit.id) return l;
      const typed = edit.values || {};
      return {
        ...l,
        editing: true,
        editPrice: typed.price ?? l.price,
        editStock: typed.stock ?? l.stock,
        editMinOrder: typed.min_order ?? l.min_order,
        editLeadDays: typed.lead_days ?? l.lead_days,
        editDescription: typed.description ?? l.description ?? '',
      };
    }),
    totalCount: Number(total),
    matchCount: Number(matches),
    fromRow: offset + 1,
    toRow: offset + listings.length,
    pager: buildPager(page, totalPages),
  };
}

// Dropdown 1: categories that still have items this seller can list, with how many.
async function loadCategoryOptions(user, selectedId) {
  const [rows] = await db.execute(
    `SELECT c.category_id, c.category_name, COUNT(*) AS available
       FROM Items i
       JOIN Categories c ON c.category_id = i.category_id
      WHERE i.is_rentable = ?
        AND NOT EXISTS (SELECT 1 FROM Listings l
                         WHERE l.item_id = i.item_id AND l.seller_id = ?)
      GROUP BY c.category_id, c.category_name
      ORDER BY c.category_name`,
    [rentableFor(user), user.user_id]
  );
  return rows.map((c) => ({ ...c, selected: c.category_id === selectedId }));
}

// Dropdown 2: the items of one category that this seller can still list.
async function loadItemOptions(user, categoryId, selectedId) {
  if (!Number.isInteger(categoryId) || categoryId <= 0) return []; // no category chosen yet
  const [rows] = await db.execute(
    `SELECT i.item_id, i.item_name, i.unit, i.avg_price
       FROM Items i
      WHERE i.category_id = ? AND i.is_rentable = ?
        AND NOT EXISTS (SELECT 1 FROM Listings l
                         WHERE l.item_id = i.item_id AND l.seller_id = ?)
      ORDER BY i.item_name`,
    [categoryId, rentableFor(user), user.user_id]
  );
  return rows.map((i) => ({ ...i, selected: i.item_id === selectedId }));
}

// What the "Add a listing" form needs.
async function formData(req, opts = {}) {
  const categoryId = Number(opts.newCategoryId);
  return {
    categoryOptions: await loadCategoryOptions(req.user, categoryId),
    itemOptions: await loadItemOptions(req.user, categoryId, Number(opts.newItemId)),
    message: opts.message,
    error: opts.error,
    newPrice: opts.newPrice,
    newStock: opts.newStock,
    newMinOrder: opts.newMinOrder ?? 1, // defaults for an empty form
    newLeadDays: opts.newLeadDays ?? 0,
    newDescription: opts.newDescription,
    ...LIMITS,
  };
}

// The form and one page of listings. Without opts.q / opts.page: all listings, page 1.
async function pageData(req, opts = {}) {
  return { ...(await formData(req, opts)), ...(await loadResults(req.user.user_id, opts.q, opts.page)) };
}

// Send only the results part: info line, table, page buttons (after search, paging, edit).
// opts: q and page (keep the seller's place), edit, message / error (shown above the table).
async function renderResults(req, res, opts = {}) {
  res.render('partials/listing-results', {
    layout: false,
    ...LIMITS,
    ...(await loadResults(req.user.user_id, opts.q, opts.page, opts.edit)),
    resultsMessage: opts.message,
    resultsError: opts.error,
  });
}

// Find one of the seller's OWN listings. Another seller's listing id gives "not found",
// so nobody can see or change someone else's listing by typing its id.
async function findOwnListing(req, id) {
  const [rows] = await db.execute(
    `SELECT l.listing_id, i.item_name
       FROM Listings l
       JOIN Items i ON i.item_id = l.item_id
      WHERE l.listing_id = ? AND l.seller_id = ?`,
    [id, req.user.user_id]
  );
  return rows[0];
}

// Send the form + list fragment (after adding or deleting a listing).
// message / error show above the form; resultsMessage / resultsError above the table.
async function renderPage(req, res, opts = {}) {
  res.render('partials/listing-page', {
    layout: false,
    ...(await pageData(req, opts)),
    resultsMessage: opts.resultsMessage,
    resultsError: opts.resultsError,
  });
}

// Price: up to 10 digits before the point and 2 after (DECIMAL(12,2)), more than 0.
function cleanPrice(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    return { error: 'Price must be more than 0, with at most 2 decimals (e.g. 120 or 99.50).' };
  }
  return { price: text };
}

// Stock, minimum order and lead time: a whole number between min and max.
function cleanWhole(raw, label, min, max) {
  const text = String(raw ?? '').trim();
  if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max) {
    return { error: `${label} must be a whole number from ${min} to ${max}.` };
  }
  return { value: Number(text) };
}

// Description: optional; an empty box is saved as NULL.
function cleanDescription(raw) {
  const text = String(raw ?? '').trim();
  if (text.length > DESC_MAX) return { error: `Description must be at most ${DESC_MAX} characters.` };
  return { description: text || null };
}

// Price, stock, minimum order, lead time and description: the same rules for adding and editing.
function cleanTerms(body) {
  const { price, error: priceError } = cleanPrice(body.price);
  if (priceError) return { error: priceError };
  const { value: stock, error: stockError } = cleanWhole(body.stock, 'Stock', 0, STOCK_MAX);
  if (stockError) return { error: stockError };
  const { value: minOrder, error: minError } = cleanWhole(body.min_order, 'Minimum order', 1, STOCK_MAX);
  if (minError) return { error: minError };
  const { value: leadDays, error: leadError } = cleanWhole(body.lead_days, 'Lead time', 0, LEAD_MAX);
  if (leadError) return { error: leadError };
  const { description, error: descError } = cleanDescription(body.description);
  if (descError) return { error: descError };
  return { terms: { price, stock, minOrder, leadDays, description } };
}

// Wrap every handler: an unexpected error is logged and a short message is sent instead of crashing.
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Listings error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// Full page
router.get('/', safe(async (req, res) => {
  res.render('listings/index', { title: 'My listings', ...(await pageData(req)) });
}));

// Search, page buttons and Cancel: only the results part (HTMX swaps it).
router.get('/results', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/listings'); // typed in the address bar
  await renderResults(req, res, { q: req.query.q, page: req.query.page });
}));

// The <option>s of the item dropdown, after a category is chosen (HTMX puts them into the <select>).
router.get('/item-options', safe(async (req, res) => {
  res.render('partials/listing-item-options', {
    layout: false,
    itemOptions: await loadItemOptions(req.user, Number(req.query.category_id)),
  });
}));

// CREATE
router.post('/', safe(async (req, res) => {
  // If something is wrong, the form keeps what the seller typed.
  const keep = {
    newCategoryId: req.body.category_id,
    newItemId: req.body.item_id,
    newPrice: req.body.price,
    newStock: req.body.stock,
    newMinOrder: req.body.min_order,
    newLeadDays: req.body.lead_days,
    newDescription: req.body.description,
  };

  // The item must exist and match the seller's type (never trust the dropdown alone).
  const itemId = Number(req.body.item_id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return renderPage(req, res, { error: 'Please choose an item from the list.', ...keep });
  }
  const [items] = await db.execute('SELECT item_name, is_rentable FROM Items WHERE item_id = ?', [itemId]);
  if (items.length === 0 || Number(items[0].is_rentable) !== rentableFor(req.user)) {
    return renderPage(req, res, { error: 'Please choose an item from the list.', ...keep });
  }
  const name = items[0].item_name;

  const { terms, error } = cleanTerms(req.body);
  if (error) return renderPage(req, res, { error, ...keep });

  try {
    await db.execute(
      `INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId, req.user.user_id, terms.price, terms.stock, terms.minOrder, terms.leadDays, terms.description]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderPage(req, res, { error: `You already list "${name}". Edit that listing instead.` });
    }
    throw err;
  }
  await renderPage(req, res, { message: `"${name}" is now listed.` });
}));

// Show one row as an edit form
router.get('/:id(\\d+)/edit', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/listings'); // typed in the address bar
  const where = { q: req.query.q, page: req.query.page };
  const listing = await findOwnListing(req, Number(req.params.id));
  if (!listing) return renderResults(req, res, { ...where, error: 'That listing no longer exists.' });
  await renderResults(req, res, { ...where, edit: { id: listing.listing_id } });
}));

// UPDATE (only the seller's own listing; the item itself cannot change)
router.put('/:id(\\d+)', safe(async (req, res) => {
  const where = { q: req.body.q, page: req.body.page };
  const listing = await findOwnListing(req, Number(req.params.id));
  if (!listing) return renderResults(req, res, { ...where, error: 'That listing no longer exists.' });

  const { terms, error } = cleanTerms(req.body);
  if (error) {
    // Keep the row open with what the seller typed, so they only fix the wrong field.
    return renderResults(req, res, { ...where, error, edit: { id: listing.listing_id, values: req.body } });
  }

  await db.execute(
    `UPDATE Listings
        SET price = ?, stock = ?, min_order = ?, lead_days = ?, description = ?
      WHERE listing_id = ? AND seller_id = ?`,
    [terms.price, terms.stock, terms.minOrder, terms.leadDays, terms.description,
     listing.listing_id, req.user.user_id]
  );
  await renderResults(req, res, { ...where, message: `"${listing.item_name}" was updated.` });
}));

// DELETE (only the seller's own listing)
router.delete('/:id(\\d+)', safe(async (req, res) => {
  const input = { ...req.query, ...req.body };      // HTMX sends DELETE values in the URL
  const where = { q: input.q, page: input.page };   // stay on the same search and page
  const listing = await findOwnListing(req, Number(req.params.id));
  if (!listing) return renderPage(req, res, { ...where, resultsError: 'That listing no longer exists.' });

  try {
    await db.execute('DELETE FROM Listings WHERE listing_id = ? AND seller_id = ?',
      [listing.listing_id, req.user.user_id]);
  } catch (err) {
    // Later, carts and orders will point to listings; the database then refuses the delete.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return renderPage(req, res, {
        ...where,
        resultsError: `"${listing.item_name}" is in a cart or an order, so it can't be deleted. Set its stock to 0 instead.`,
      });
    }
    throw err;
  }
  await renderPage(req, res, { ...where, resultsMessage: `"${listing.item_name}" was deleted.` });
}));

module.exports = router;