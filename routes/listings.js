// Listings: a Supplier's or Rental partner's own offers (catalog item + own price + stock).
// app.js only lets Suppliers and Rentals in, so req.user is always a seller here.
const express = require('express');
const db = require('../db');

const router = express.Router();

// Runs before every route in this file: tells the views whether prices are per day.
router.use((req, res, next) => {
  res.locals.isRental = req.user.account_type === 'Rental';
  next();
});

// READ: the logged-in seller's listings, with the item and category names.
async function loadMyListings(sellerId) {
  const [rows] = await db.execute(
    `SELECT l.listing_id, l.price, l.stock,
            i.item_name, i.unit, i.avg_price, c.category_name
       FROM Listings l
       JOIN Items i      ON i.item_id = l.item_id
       JOIN Categories c ON c.category_id = i.category_id
      WHERE l.seller_id = ?
      ORDER BY i.item_name`,
    [sellerId]
  );
  return rows;
}

// Send only the list fragment (the part HTMX swaps). Used by the next steps.
async function renderList(req, res, opts = {}) {
  res.render('partials/listing-list', {
    layout: false,
    listings: await loadMyListings(req.user.user_id),
    message: opts.message,
    error: opts.error,
  });
}

// Wrap every handler: an unexpected error is logged and shown as a message instead of crashing.
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Listings error:', err);
    try {
      await renderList(req, res, { error: 'Something went wrong. Please try again.' });
    } catch (err2) {
      res.status(500).send('Database error');
    }
  }
};

// Full page
router.get('/', safe(async (req, res) => {
  res.render('listings/index', {
    title: 'My listings',
    listings: await loadMyListings(req.user.user_id),
  });
}));

module.exports = router;