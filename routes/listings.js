// Listings: a Supplier's or Rental partner's own offers (catalog item + own price + stock).
// app.js only lets Suppliers and Rentals in, so req.user is always a seller here.
const express = require('express');
const db = require('../db');
const { pageNumber, buildPager } = require('../lib/pager');

const router = express.Router();
const STOCK_MAX = 1000000; // largest stock or minimum order
const LEAD_MAX = 365;      // longest lead time in days
const DESC_MAX = 500;      // Listings.description is VARCHAR(500)
const PAGE_SIZE = 10;      // listings per page
const PRODUCT_NAME_MAX = 255; // Items.item_name is VARCHAR(255)
const UNIT_MAX = 20;          // Items.unit is VARCHAR(20)
const LIMITS = {               // for the inputs' max/maxlength
  stockMax: STOCK_MAX, leadMax: LEAD_MAX, descMax: DESC_MAX, productNameMax: PRODUCT_NAME_MAX, unitMax: UNIT_MAX,
};

// Runs before every route in this file: tells the views whether prices are per day,
// and whether the Admin rejected this Supplier (then the seller can only look and delete).
router.use(async (req, res, next) => {
  try {
    res.locals.isRental = req.user.account_type === 'Rental';
    const [rows] = await db.execute('SELECT verification_status, review_note FROM Suppliers WHERE user_id = ?', [req.user.user_id]);
    res.locals.isRejected = rows.length > 0 && rows[0].verification_status === 'Rejected';
    res.locals.rejectReason = res.locals.isRejected ? rows[0].review_note : null; // the Admin's reason
    next();
  } catch (err) {
    next(err);
  }
});
const REJECTED_MESSAGE = 'Your account was rejected by the Admin, so you cannot add or change products. Please contact Project Flow.';

// Suppliers list materials (is_rentable = 0), Rental partners list equipment (is_rentable = 1).
const rentableFor = (user) => (user.account_type === 'Rental' ? 1 : 0);

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
  const page = pageNumber(rawPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // PAGE_SIZE and offset are numbers computed here (never text from the user),
  // so they can be written into the SQL directly.
  const [listings] = await db.execute(
    `SELECT l.listing_id, l.price, l.stock, l.min_order, l.lead_days, l.description,
            i.item_name, i.unit, i.avg_price, i.is_reviewed, c.category_name
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

// Dropdown 1: categories with products of the seller's type, plus empty categories (a seller can add
// the first product to a new category). With how many products there are and how many the seller lists.
async function loadCategoryOptions(user, selectedId) {
  const [rows] = await db.execute(
    `SELECT c.category_id, c.category_name,
            COUNT(i.item_id) AS item_count,
            COALESCE(SUM(EXISTS (SELECT 1 FROM Listings l
                                  WHERE l.item_id = i.item_id AND l.seller_id = ?)), 0) AS listed_count
       FROM Categories c
       LEFT JOIN Items i ON i.category_id = c.category_id AND i.is_rentable = ?
      GROUP BY c.category_id, c.category_name
     HAVING item_count > 0 OR NOT EXISTS (SELECT 1 FROM Items x WHERE x.category_id = c.category_id)
      ORDER BY c.category_name = 'Others', c.category_name`,
    [user.user_id, rentableFor(user)]
  );
  return rows.map((c) => ({ ...c, listed_count: Number(c.listed_count), selected: c.category_id === selectedId }));
}

// Dropdown 2: every product of one category. Products the seller already lists are shown,
// but disabled ("already listed"), so the seller sees they are in the catalog.
async function loadItemOptions(user, categoryId, selectedId) {
  if (!Number.isInteger(categoryId) || categoryId <= 0) return []; // no category chosen yet
  const [rows] = await db.execute(
    `SELECT i.item_id, i.item_name, i.unit, i.avg_price, i.is_reviewed,
            EXISTS (SELECT 1 FROM Listings l WHERE l.item_id = i.item_id AND l.seller_id = ?) AS already_listed
       FROM Items i
      WHERE i.category_id = ? AND i.is_rentable = ?
      ORDER BY already_listed, i.item_name`,
    [user.user_id, categoryId, rentableFor(user)]
  );
  return rows.map((i) => ({ ...i, selected: i.item_id === selectedId }));
}

// What the "Add a listing" form needs.
async function formData(req, opts = {}) {
  const categoryId = Number(opts.newCategoryId);
  return {
    categoryOptions: await loadCategoryOptions(req.user, categoryId),
    itemOptions: await loadItemOptions(req.user, categoryId, Number(opts.newItemId)),
    categoryChosen: Number.isInteger(categoryId) && categoryId > 0,
    newSelected: opts.newItemId === 'new', // "My product is not in this list"
    newProductName: opts.newProductName,
    newProductUnit: opts.newProductUnit,
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

// A product that is not in the catalog yet: name and unit typed by the seller.
function cleanNewProduct(body) {
  const name = String(body.new_name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Please type the name of the new product.' };
  if (name.length > PRODUCT_NAME_MAX) return { error: `Product name must be at most ${PRODUCT_NAME_MAX} characters.` };
  const unit = String(body.new_unit ?? '').trim();
  if (!unit) return { error: 'Please type the unit of the new product (e.g. Bag, kg, Hour).' };
  if (unit.length > UNIT_MAX) return { error: `Unit must be at most ${UNIT_MAX} characters.` };
  return { product: { name, unit } };
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
  const categoryId = Number(req.query.category_id);
  res.render('partials/listing-item-options-response', {
    layout: false,
    itemOptions: await loadItemOptions(req.user, categoryId),
    categoryChosen: Number.isInteger(categoryId) && categoryId > 0,
  });
}));

// The "new product" fields (name and unit), shown when the seller picks "My product is not in this list".
router.get('/new-product-fields', safe(async (req, res) => {
  if (req.query.item_id !== 'new') return res.send('');
  res.render('partials/listing-new-product', { layout: false, ...LIMITS });
}));

// CREATE: a listing for a catalog product, or (item_id = 'new') a new product plus its listing.
router.post('/', safe(async (req, res) => {
  if (res.locals.isRejected) return renderPage(req, res, { error: REJECTED_MESSAGE });
  // If something is wrong, the form keeps what the seller typed.
  const keep = {
    newCategoryId: req.body.category_id,
    newItemId: req.body.item_id,
    newProductName: req.body.new_name,
    newProductUnit: req.body.new_unit,
    newPrice: req.body.price,
    newStock: req.body.stock,
    newMinOrder: req.body.min_order,
    newLeadDays: req.body.lead_days,
    newDescription: req.body.description,
  };
  const isNew = req.body.item_id === 'new';
  let itemId;
  let name;

  if (isNew) {
    // A new product goes into the chosen category, with the seller's type (material or rental).
    const categoryId = Number(req.body.category_id);
    const [categories] = await db.execute('SELECT category_id FROM Categories WHERE category_id = ?',
      [Number.isInteger(categoryId) ? categoryId : 0]);
    if (categories.length === 0) return renderPage(req, res, { error: 'Please choose a category.', ...keep });
    const { product, error: productError } = cleanNewProduct(req.body);
    if (productError) return renderPage(req, res, { error: productError, ...keep });
    // No duplicates: the same name (upper/lower case does not matter) must be picked from the list.
    const [same] = await db.execute('SELECT item_name FROM Items WHERE item_name = ?', [product.name]);
    if (same.length > 0) {
      return renderPage(req, res, { error: `"${same[0].item_name}" is already in the catalog. Choose it from the list.`, ...keep });
    }
    name = product.name;
    keep.product = product;
  } else {
    // The item must exist and match the seller's type (never trust the dropdown alone).
    itemId = Number(req.body.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return renderPage(req, res, { error: 'Please choose a product from the list.', ...keep });
    }
    const [items] = await db.execute('SELECT item_name, is_rentable FROM Items WHERE item_id = ?', [itemId]);
    if (items.length === 0 || Number(items[0].is_rentable) !== rentableFor(req.user)) {
      return renderPage(req, res, { error: 'Please choose a product from the list.', ...keep });
    }
    name = items[0].item_name;
  }

  const { terms, error } = cleanTerms(req.body);
  if (error) return renderPage(req, res, { error, ...keep });

  const insertListing = (conn, id) => conn.execute(
    `INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.user_id, terms.price, terms.stock, terms.minOrder, terms.leadDays, terms.description]
  );

  if (isNew) {
    // Two INSERTs that belong together: a TRANSACTION makes sure we never keep a new product
    // without its listing (if the second INSERT fails, ROLLBACK undoes the first).
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute(
        `INSERT INTO Items (category_id, listed_by, item_name, unit, avg_price, is_rentable, is_reviewed)
         VALUES (?, ?, ?, ?, NULL, ?, FALSE)`,
        [Number(req.body.category_id), req.user.user_id, keep.product.name, keep.product.unit, rentableFor(req.user)]
      );
      await insertListing(conn, result.insertId);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release(); // give the connection back to the pool
    }
    return renderPage(req, res, { message: `"${name}" was added to the catalog and is now listed. The Admin will review it.` });
  }

  try {
    await insertListing(db, itemId);
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
  if (res.locals.isRejected) return renderResults(req, res, { ...where, error: REJECTED_MESSAGE });
  const listing = await findOwnListing(req, Number(req.params.id));
  if (!listing) return renderResults(req, res, { ...where, error: 'That listing no longer exists.' });
  await renderResults(req, res, { ...where, edit: { id: listing.listing_id } });
}));

// UPDATE (only the seller's own listing; the item itself cannot change)
router.put('/:id(\\d+)', safe(async (req, res) => {
  const where = { q: req.body.q, page: req.body.page };
  if (res.locals.isRejected) return renderResults(req, res, { ...where, error: REJECTED_MESSAGE });
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