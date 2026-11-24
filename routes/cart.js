// Cart: a Contractor collects offers (listings) to order, with a quantity for each.
// app.js only lets Contractors in, so req.user is always the buyer here.
const express = require('express');
const db = require('../db');
const { countCart, loadCartRows, groupCart } = require('../lib/cart');
const { checkPeriod } = require('../lib/orders');

const router = express.Router();
const QUANTITY_MAX = 1000000;

// READ: the buyer's cart, grouped by seller (one order per seller), with totals.
const loadCart = async (buyerId) => groupCart(await loadCartRows(db, buyerId));

// Send the cart fragment and, out of band, the new number for the menu badge.
async function renderCart(req, res, opts = {}) {
  const cart = await loadCart(req.user.user_id);
  res.render('partials/cart-response', {
    layout: false,
    ...cart,
    cartCount: cart.lineCount,
    message: opts.message,
    error: opts.error,
  });
}

// A whole number between min and max (the quantity typed by the buyer).
function cleanQuantity(raw, min, max) {
  const text = String(raw ?? '').trim();
  if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max) return null;
  return Number(text);
}

// Wrap every handler: an unexpected error is logged and a short message is sent instead of crashing.
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Cart error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// Full page
router.get('/', safe(async (req, res) => {
  res.render('cart/index', { title: 'Cart', ...(await loadCart(req.user.user_id)) });
}));

// CREATE: "Add to cart" on an item page. Adding an offer that is already in the cart raises its quantity.
// The answer is a short message next to the button, plus the new badge number (out of band).
router.post('/', safe(async (req, res) => {
  const reply = async (opts) => res.render('partials/cart-added', {
    layout: false,
    ...opts,
    cartCount: await countCart(db, req.user.user_id),
  });

  const listingId = Number(req.body.listing_id);
  if (!Number.isInteger(listingId) || listingId <= 0) return reply({ error: 'This offer no longer exists.' });
  const [found] = await db.execute(
    `SELECT l.listing_id, l.stock, l.min_order, l.lead_days, i.is_rentable, ci.quantity AS in_cart
       FROM MarketListings l -- an offer of a rejected seller can't be added
       JOIN Items i ON i.item_id = l.item_id
       LEFT JOIN CartItems ci ON ci.listing_id = l.listing_id AND ci.buyer_id = ?
      WHERE l.listing_id = ?`,
    [req.user.user_id, listingId]
  );
  if (found.length === 0) return reply({ error: 'This offer no longer exists.' });
  const offer = found[0];
  if (offer.stock === 0) return reply({ error: 'Sold out.' });

  const quantity = cleanQuantity(req.body.quantity, 1, QUANTITY_MAX);
  if (quantity === null) return reply({ error: 'Enter a whole number.' });
  const total = (offer.in_cart || 0) + quantity; // what the cart will hold after adding
  if (total < offer.min_order) return reply({ error: `Minimum order is ${offer.min_order}.` });
  if (total > offer.stock) {
    const what = Number(offer.is_rentable) ? `${offer.stock === 1 ? 'machine' : 'machines'} available` : 'in stock';
    return reply({ error: `Only ${offer.stock} ${what}${offer.in_cart ? ` (${offer.in_cart} already in your cart)` : ''}.` });
  }

  // Rentals: the period chosen on the product page (both days included). Adding the same machine
  // again replaces the dates with the new ones.
  let period = { startText: null, endText: null };
  if (Number(offer.is_rentable)) {
    const check = checkPeriod(req.body.rent_start, req.body.rent_end, offer.lead_days);
    if (check.error) return reply({ error: check.error });
    period = { startText: req.body.rent_start, endText: req.body.rent_end, days: check.days };
  }

  // One statement for "new line" and "raise the quantity": the UNIQUE (buyer_id, listing_id) key decides.
  await db.execute(
    `INSERT INTO CartItems (buyer_id, listing_id, quantity, rent_start, rent_end) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = ?, rent_start = ?, rent_end = ?`,
    [req.user.user_id, listingId, total, period.startText, period.endText, total, period.startText, period.endText]
  );
  if (period.days) {
    reply({ message: `Added. ${total} ${total === 1 ? 'machine' : 'machines'} for ${period.days} ${period.days === 1 ? 'day' : 'days'} in your cart.` });
  } else {
    reply({ message: `Added. ${total} in your cart.` });
  }
}));

// UPDATE: change the quantity (and for rentals the dates) of one line (only in the buyer's own cart).
// The row's inputs are sent together (hx-include="closest tr").
router.put('/:id(\\d+)', safe(async (req, res) => {
  const [found] = await db.execute(
    `SELECT ci.cart_item_id, i.item_name, i.is_rentable, l.stock, l.min_order, l.lead_days
       FROM CartItems ci
       JOIN Listings l ON l.listing_id = ci.listing_id
       JOIN Items i    ON i.item_id = l.item_id
      WHERE ci.cart_item_id = ? AND ci.buyer_id = ?`,
    [Number(req.params.id), req.user.user_id]
  );
  if (found.length === 0) return renderCart(req, res, { error: 'That item is no longer in your cart.' });
  const line = found[0];

  const quantity = cleanQuantity(req.body.quantity, line.min_order, line.stock);
  if (quantity === null) {
    const range = line.stock >= line.min_order ? `from ${line.min_order} to ${line.stock}` : 'not possible right now (not enough stock)';
    return renderCart(req, res, { error: `Quantity for "${line.item_name}" must be a whole number ${range}.` });
  }
  if (Number(line.is_rentable)) {
    const check = checkPeriod(req.body.rent_start, req.body.rent_end, line.lead_days);
    if (check.error) return renderCart(req, res, { error: `"${line.item_name}": ${check.error}` });
    await db.execute(
      'UPDATE CartItems SET quantity = ?, rent_start = ?, rent_end = ? WHERE cart_item_id = ? AND buyer_id = ?',
      [quantity, req.body.rent_start, req.body.rent_end, line.cart_item_id, req.user.user_id]
    );
    return renderCart(req, res, { message: `"${line.item_name}" updated.` });
  }
  await db.execute('UPDATE CartItems SET quantity = ? WHERE cart_item_id = ? AND buyer_id = ?',
    [quantity, line.cart_item_id, req.user.user_id]);
  await renderCart(req, res, { message: `Quantity for "${line.item_name}" updated.` });
}));

// DELETE one line (only from the buyer's own cart)
router.delete('/:id(\\d+)', safe(async (req, res) => {
  const [result] = await db.execute('DELETE FROM CartItems WHERE cart_item_id = ? AND buyer_id = ?',
    [Number(req.params.id), req.user.user_id]);
  await renderCart(req, res, result.affectedRows ? { message: 'Item removed from your cart.' } : {});
}));

// DELETE everything in the buyer's cart
router.delete('/', safe(async (req, res) => {
  await db.execute('DELETE FROM CartItems WHERE buyer_id = ?', [req.user.user_id]);
  await renderCart(req, res, { message: 'Your cart is empty now.' });
}));

module.exports = router;
