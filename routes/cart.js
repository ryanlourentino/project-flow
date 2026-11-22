// Cart: a Contractor collects offers (listings) to order, with a quantity for each.
// app.js only lets Contractors in, so req.user is always the buyer here.
const express = require('express');
const db = require('../db');

const router = express.Router();
const QUANTITY_MAX = 1000000;

// Money is added up in cents (whole numbers), so 0.1 + 0.2 never becomes 0.30000000000000004.
const toCents = (price) => Math.round(Number(price) * 100);

// How many different offers are in the buyer's cart (the number on the menu badge).
async function countCart(buyerId) {
  const [[{ line_count: lineCount }]] = await db.execute('SELECT COUNT(*) AS line_count FROM CartItems WHERE buyer_id = ?', [buyerId]);
  return Number(lineCount);
}

// What is wrong with a cart line right now (the seller may have changed stock or terms since).
function problemFor(row) {
  if (row.verification_status === 'Rejected') return 'This seller is not available right now. Remove it from your cart.';
  if (row.stock === 0) return 'Sold out. Remove it or wait for new stock.';
  if (row.quantity > row.stock) return `Only ${row.stock} in stock.`;
  if (row.quantity < row.min_order) return `Minimum order is ${row.min_order}.`;
  return null;
}

// READ: the buyer's cart, grouped by seller (one future order per seller), with totals.
async function loadCart(buyerId) {
  const [rows] = await db.execute(
    `SELECT ci.cart_item_id, ci.quantity,
            l.listing_id, l.price, l.stock, l.min_order, l.lead_days,
            i.item_id, i.item_name, i.unit,
            u.user_id AS seller_id, u.company_name AS seller_name, s.verification_status
       FROM CartItems ci
       JOIN Listings l ON l.listing_id = ci.listing_id
       JOIN Items i    ON i.item_id = l.item_id
       JOIN Users u    ON u.user_id = l.seller_id
       LEFT JOIN Suppliers s ON s.user_id = l.seller_id -- a rejected seller's line gets a problem
      WHERE ci.buyer_id = ?
      ORDER BY u.company_name, i.item_name`,
    [buyerId]
  );

  const groups = [];
  let totalCents = 0;
  for (const row of rows) {
    const lineCents = toCents(row.price) * row.quantity;
    totalCents += lineCents;
    let group = groups[groups.length - 1];
    if (!group || group.seller_id !== row.seller_id) {
      group = { seller_id: row.seller_id, seller_name: row.seller_name, items: [], subtotalCents: 0, maxLeadDays: 0 };
      groups.push(group);
    }
    group.items.push({ ...row, lineTotal: lineCents / 100, problem: problemFor(row) });
    group.subtotalCents += lineCents;
    group.maxLeadDays = Math.max(group.maxLeadDays, row.lead_days);
  }

  return {
    groups: groups.map((g) => ({ ...g, subtotal: g.subtotalCents / 100 })),
    lineCount: rows.length,
    total: totalCents / 100,
    hasProblems: groups.some((g) => g.items.some((item) => item.problem)),
  };
}

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
    cartCount: await countCart(req.user.user_id),
  });

  const listingId = Number(req.body.listing_id);
  if (!Number.isInteger(listingId) || listingId <= 0) return reply({ error: 'This offer no longer exists.' });
  const [found] = await db.execute(
    `SELECT l.listing_id, l.stock, l.min_order, ci.quantity AS in_cart
       FROM MarketListings l -- an offer of a rejected seller can't be added
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
    return reply({ error: `Only ${offer.stock} in stock${offer.in_cart ? ` (${offer.in_cart} already in your cart)` : ''}.` });
  }

  // One statement for "new line" and "raise the quantity": the UNIQUE (buyer_id, listing_id) key decides.
  await db.execute(
    `INSERT INTO CartItems (buyer_id, listing_id, quantity) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = ?`,
    [req.user.user_id, listingId, total, total]
  );
  reply({ message: `Added. ${total} in your cart.` });
}));

// UPDATE: change the quantity of one line (only in the buyer's own cart).
router.put('/:id(\\d+)', safe(async (req, res) => {
  const [found] = await db.execute(
    `SELECT ci.cart_item_id, i.item_name, l.stock, l.min_order
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
