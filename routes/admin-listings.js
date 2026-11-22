// Admin: every seller's listings in one table, to find and remove a listing that breaks the rules
// (wrong product, fake price, offensive text...). The Admin cannot change prices: that is the seller's job.
// app.js only lets the Admin in.
const express = require('express');
const db = require('../db');
const { pageNumber, buildPager, searchPattern } = require('../lib/pager');
const { notify } = require('../lib/notify');

const router = express.Router();
const PAGE_SIZE = 15;

// READ: one page of all listings. The search looks in the product, seller, category and description.
async function loadListings(rawQuery, rawPage) {
  const { q, like } = searchPattern(rawQuery);
  const from = `FROM Listings l
       JOIN Items i      ON i.item_id = l.item_id
       JOIN Categories c ON c.category_id = i.category_id
       JOIN Users u      ON u.user_id = l.seller_id
       LEFT JOIN Suppliers s ON s.user_id = l.seller_id
      WHERE (? = '' OR i.item_name LIKE ? OR u.company_name LIKE ? OR c.category_name LIKE ? OR l.description LIKE ?)`;
  const params = [q, like, like, like, like];

  const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM Listings');
  const [[{ matches }]] = await db.execute(`SELECT COUNT(*) AS matches ${from}`, params);
  const totalPages = Math.max(1, Math.ceil(Number(matches) / PAGE_SIZE));
  const page = pageNumber(rawPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // Newest first: a new listing is the one most likely to need a check.
  const [listings] = await db.execute(
    `SELECT l.listing_id, l.price, l.stock, l.description, l.created_at,
            i.item_id, i.item_name, i.unit, i.avg_price, i.is_rentable, i.is_reviewed, c.category_name,
            u.user_id AS seller_id, u.company_name, s.verification_status
       ${from}
      ORDER BY l.created_at DESC, l.listing_id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  );

  return {
    q,
    page,
    totalCount: Number(total),
    matchCount: Number(matches),
    fromRow: offset + 1,
    toRow: offset + listings.length,
    pager: buildPager(page, totalPages),
    listings: listings.map((l) => ({
      ...l,
      sellerRejected: l.verification_status === 'Rejected',
      // More than 3x or less than a third of the market average: worth a look.
      priceOdd: Number(l.avg_price) > 0
        && (Number(l.price) > 3 * Number(l.avg_price) || Number(l.price) < Number(l.avg_price) / 3),
    })),
  };
}

async function renderResults(req, res, where, opts = {}) {
  res.render('partials/admin-listing-results', {
    layout: false,
    ...(await loadListings(where.q, where.page)),
    message: opts.message,
    error: opts.error,
  });
}

const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Admin listings error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// Full page
router.get('/', safe(async (req, res) => {
  res.render('admin/listings', { title: 'All listings', ...(await loadListings('', 1)) });
}));

// Search and pages: only the results part.
router.get('/results', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/admin/listings');
  await renderResults(req, res, req.query);
}));

// DELETE: remove one listing. Cart lines with it disappear too (ON DELETE CASCADE);
// the seller gets a notification saying which product was removed.
router.delete('/:id(\\d+)', safe(async (req, res) => {
  const where = { q: req.query.q, page: req.query.page }; // HTMX sends DELETE values in the URL
  const [found] = await db.execute(
    `SELECT l.listing_id, l.seller_id, i.item_name, u.company_name
       FROM Listings l JOIN Items i ON i.item_id = l.item_id JOIN Users u ON u.user_id = l.seller_id
      WHERE l.listing_id = ?`,
    [Number(req.params.id)]
  );
  if (found.length === 0) return renderResults(req, res, where, { error: 'That listing no longer exists.' });
  const listing = found[0];

  try {
    await db.execute('DELETE FROM Listings WHERE listing_id = ?', [listing.listing_id]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') { // later: orders will point to listings
      return renderResults(req, res, where, { error: `"${listing.item_name}" is part of an order, so it can't be removed.` });
    }
    throw err;
  }
  await notify(db, listing.seller_id,
    `The Admin removed your listing "${listing.item_name}" because it did not follow the marketplace rules.`);
  await renderResults(req, res, where, { message: `Removed "${listing.item_name}" by ${listing.company_name}. The seller was notified.` });
}));

module.exports = router;
