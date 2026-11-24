// The buyer's cart, shared by the Cart page (routes/cart.js) and the checkout (routes/orders.js).
const { lineCents, rentalBasis } = require('./orders');

// How many different offers are in the buyer's cart (the number on the menu badge).
async function countCart(db, buyerId) {
  const [[{ line_count: lineCount }]] = await db.execute(
    'SELECT COUNT(*) AS line_count FROM CartItems WHERE buyer_id = ?', [buyerId]);
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

// The cart lines with everything about their offer. db can be the pool or a connection in a transaction;
// forUpdate = true locks the rows until COMMIT, so nobody can change the stock while we are ordering.
async function loadCartRows(db, buyerId, forUpdate = false) {
  const [rows] = await db.execute(
    `SELECT ci.cart_item_id, ci.quantity,
            l.listing_id, l.price, l.stock, l.min_order, l.lead_days,
            i.item_id, i.item_name, i.unit, i.is_rentable,
            u.user_id AS seller_id, u.company_name AS seller_name, s.verification_status
       FROM CartItems ci
       JOIN Listings l ON l.listing_id = ci.listing_id
       JOIN Items i    ON i.item_id = l.item_id
       JOIN Users u    ON u.user_id = l.seller_id
       LEFT JOIN Suppliers s ON s.user_id = l.seller_id -- a rejected seller's line gets a problem
      WHERE ci.buyer_id = ?
      ORDER BY u.company_name, i.item_name
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [buyerId]
  );
  return rows;
}

// Group the lines by seller (one order per seller) and add up the money.
// periods (checkout only): cart_item_id -> { days, ... } for every rental line.
// Without periods (the Cart page) a rental is counted for 1 day.
function groupCart(rows, periods = {}) {
  const groups = [];
  let totalCents = 0;
  for (const row of rows) {
    const period = periods[row.cart_item_id];
    const days = period && period.days ? period.days : 1;
    const cents = lineCents(row, days);
    totalCents += cents;
    let group = groups[groups.length - 1];
    if (!group || group.seller_id !== row.seller_id) {
      group = { seller_id: row.seller_id, seller_name: row.seller_name, items: [], subtotalCents: 0, maxLeadDays: 0 };
      groups.push(group);
    }
    group.items.push({
      ...row,
      isRental: Boolean(Number(row.is_rentable)),
      period,
      basis: Number(row.is_rentable) ? rentalBasis(row.unit, days) : null,
      lineCents: cents,
      lineTotal: cents / 100,
      problem: problemFor(row),
    });
    group.subtotalCents += cents;
    group.maxLeadDays = Math.max(group.maxLeadDays, row.lead_days);
  }
  return {
    groups: groups.map((g) => ({ ...g, subtotal: g.subtotalCents / 100 })),
    lineCount: rows.length,
    totalCents,
    total: totalCents / 100,
    hasRentals: rows.some((r) => Number(r.is_rentable)),
    hasProblems: groups.some((g) => g.items.some((item) => item.problem)),
  };
}

module.exports = { countCart, problemFor, loadCartRows, groupCart };
