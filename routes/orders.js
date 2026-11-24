// Orders for a Contractor: checkout (the cart becomes one purchase order per seller) and "My orders".
// app.js only lets Contractors in, so req.user is always the buyer here.
const express = require('express');
const db = require('../db');
const { countCart, loadCartRows, groupCart, problemFor } = require('../lib/cart');
const {
  RENTAL_DAYS_MAX, dayNumber, dayText, isoDay, today, rentalDays, lineCents, rentalBasis,
} = require('../lib/orders');
const { notify } = require('../lib/notify');

const router = express.Router();
const NOTE_MAX = 500;

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const moneyText = (cents) => moneyFormat.format(cents / 100);

// Runs before every route here: the Contractor's own contractor_id (Projects and orders use it).
router.use(async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT contractor_id FROM Contractors WHERE user_id = ?', [req.user.user_id]);
    req.contractorId = rows[0] ? rows[0].contractor_id : 0;
    next();
  } catch (err) {
    next(err);
  }
});

// Projects an order can go to: the Contractor's own, not completed yet.
async function loadProjects(contractorId, selectedId) {
  const [rows] = await db.execute(
    `SELECT proj_id, proj_name, proj_address FROM Projects
      WHERE contractor_id = ? AND (proj_phase IS NULL OR proj_phase <> 'Completed')
      ORDER BY proj_name`,
    [contractorId]
  );
  return rows.map((p) => ({ ...p, selected: p.proj_id === selectedId }));
}

// The rental period typed for one cart line (fields start_<id> and end_<id>), checked.
// Earliest start: today + the seller's lead time. Empty fields get a 1-day period on the earliest day.
function rentalPeriod(row, body) {
  const earliest = today() + Number(row.lead_days);
  const startText = body[`start_${row.cart_item_id}`] || dayText(earliest);
  const endText = body[`end_${row.cart_item_id}`] || startText;
  const period = { startText, endText, min: dayText(earliest) };
  const start = dayNumber(startText);
  const end = dayNumber(endText);
  if (start === null || end === null) return { ...period, error: 'Please choose a start and an end date.' };
  if (start < earliest) return { ...period, error: `The earliest start is ${dayText(earliest)} (lead time ${row.lead_days} ${Number(row.lead_days) === 1 ? 'day' : 'days'}).` };
  if (end < start) return { ...period, error: 'The end date must be on or after the start date.' };
  if (rentalDays(start, end) > RENTAL_DAYS_MAX) return { ...period, error: `A rental can last at most ${RENTAL_DAYS_MAX} days.` };
  return { ...period, start, end, days: rentalDays(start, end) };
}

// Everything the checkout page needs, from the cart lines and what the Contractor typed (body).
async function checkoutData(req, rows, body = {}) {
  const periods = {};
  for (const row of rows) {
    if (Number(row.is_rentable)) periods[row.cart_item_id] = rentalPeriod(row, body);
  }
  const cart = groupCart(rows, periods);
  const projId = Number(body.proj_id);
  return {
    ...cart,
    projects: await loadProjects(req.contractorId, projId),
    note: body.note ?? '',
    noteMax: NOTE_MAX,
    hasDateErrors: Object.values(periods).some((p) => p.error),
  };
}

const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Orders error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// ---------- Checkout ----------

// The checkout page. An empty cart or a cart with problems goes back to the Cart page.
router.get('/checkout', safe(async (req, res) => {
  const rows = await loadCartRows(db, req.user.user_id);
  if (rows.length === 0 || rows.some(problemFor)) return res.redirect('/cart');
  res.render('orders/checkout', { title: 'Checkout', ...(await checkoutData(req, rows)) });
}));

// Live update while the Contractor fills in the form (a rental date changed): new totals, nothing saved.
router.post('/checkout/preview', safe(async (req, res) => {
  const rows = await loadCartRows(db, req.user.user_id);
  res.render('partials/checkout-form', { layout: false, ...(await checkoutData(req, rows, req.body)) });
}));

// CREATE: place the orders. Everything happens in one transaction: if anything is wrong, nothing is saved.
router.post('/', safe(async (req, res) => {
  const showForm = async (rows, error) => res.render('partials/checkout-form', {
    layout: false, ...(await checkoutData(req, rows, req.body)), error,
  });

  // The project: one of the Contractor's own, not completed, with a site address to deliver to.
  const projId = Number(req.body.proj_id);
  const [projects] = await db.execute(
    `SELECT proj_id, proj_name, proj_address FROM Projects
      WHERE proj_id = ? AND contractor_id = ? AND (proj_phase IS NULL OR proj_phase <> 'Completed')`,
    [Number.isInteger(projId) ? projId : 0, req.contractorId]
  );
  const project = projects[0];
  const note = String(req.body.note ?? '').trim();

  const conn = await db.getConnection();
  const orders = []; // the new order numbers
  try {
    await conn.beginTransaction();
    // FOR UPDATE: lock the cart and the offers until COMMIT, so the stock we check is the stock we take.
    const rows = await loadCartRows(conn, req.user.user_id, true);
    const data = await checkoutData(req, rows, req.body);
    let error = null;
    if (rows.length === 0) error = 'Your cart is empty.';
    else if (!project) error = 'Please choose the project these products are for.';
    else if (!project.proj_address) error = `Project "${project.proj_name}" has no site address. Add one on the Projects page first.`;
    else if (note.length > NOTE_MAX) error = `The note can have at most ${NOTE_MAX} characters.`;
    else if (data.hasProblems) error = 'Something in your cart changed (stock, minimum order or seller). Please check the items marked in red.';
    else if (data.hasDateErrors) error = 'Please fix the rental dates marked in red.';
    // The total the Contractor saw on the page must still be the total now (a seller may have changed a price).
    else if (Number(req.body.expected_total) !== data.totalCents) {
      error = `A price changed while you were ordering. The new total is ${moneyText(data.totalCents)}. Please check and order again.`;
    }
    if (error) {
      await conn.rollback();
      return showForm(rows, error);
    }

    // One order per seller.
    for (const group of data.groups) {
      const [result] = await conn.execute(
        `INSERT INTO PurchaseOrders (contractor_id, seller_id, proj_id, delivery_address, order_date, ordered_at,
                                     order_status, total_value, note)
         VALUES (?, ?, ?, ?, CURDATE(), NOW(), 'Pending', ?, ?)`,
        [req.contractorId, group.seller_id, project.proj_id, project.proj_address, group.subtotalCents / 100, note || null]
      );
      const orderId = result.insertId;
      for (const line of group.items) {
        // The price is copied into the order: if the seller changes the listing later, this order keeps its price.
        await conn.execute(
          `INSERT INTO OrderItems (order_id, item_id, listing_id, quantity, unit_price, discount_rate, line_status,
                                   rent_start, rent_end)
           VALUES (?, ?, ?, ?, ?, 0, 'Pending', ?, ?)`,
          [orderId, line.item_id, line.listing_id, line.quantity, line.price,
            line.period ? line.period.startText : null, line.period ? line.period.endText : null]
        );
        // Reserve the stock now; it goes back if the seller declines the line or the order is cancelled.
        await conn.execute('UPDATE Listings SET stock = stock - ? WHERE listing_id = ?', [line.quantity, line.listing_id]);
      }
      await notify(conn, group.seller_id,
        `New order #${orderId} from ${req.user.company_name}: ${group.items.length} ${group.items.length === 1 ? 'product' : 'products'}, `
        + `${moneyText(group.subtotalCents)}, for delivery to ${project.proj_address}.`);
      orders.push(orderId);
    }
    await conn.execute('DELETE FROM CartItems WHERE buyer_id = ?', [req.user.user_id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // HX-Redirect: HTMX loads this page as a whole (the menu's cart badge becomes 0 too).
  res.set('HX-Redirect', `/orders?placed=${orders.length}`).send('');
}));

// ---------- My orders ----------

// READ: the Contractor's orders placed in the app (newest first).
router.get('/', safe(async (req, res) => {
  const [orders] = await db.execute(
    `SELECT po.order_id, po.ordered_at, po.order_status, po.total_value, po.delivery_address,
            u.user_id AS seller_id, u.company_name AS seller_name, u.account_type AS seller_type, p.proj_name,
            (SELECT COUNT(*) FROM OrderItems oi WHERE oi.order_id = po.order_id) AS line_count
       FROM PurchaseOrders po
       JOIN Users u ON u.user_id = po.seller_id
       LEFT JOIN Projects p ON p.proj_id = po.proj_id
      WHERE po.contractor_id = ? AND po.seller_id IS NOT NULL
      ORDER BY po.ordered_at DESC, po.order_id DESC`,
    [req.contractorId]
  );
  const placed = Number.parseInt(req.query.placed, 10);
  res.render('orders/index', {
    title: 'My orders',
    orders: orders.map((o) => ({ ...o, isRental: o.seller_type === 'Rental' })),
    cartCount: await countCart(db, req.user.user_id),
    message: placed > 0
      ? `${placed === 1 ? 'Your order was' : `${placed} orders were`} sent. The ${placed === 1 ? 'seller' : 'sellers'} will accept or decline each product.`
      : null,
  });
}));

// READ: one order with its lines (only the Contractor's own orders).
router.get('/:id(\\d+)', safe(async (req, res) => {
  const [found] = await db.execute(
    `SELECT po.order_id, po.ordered_at, po.order_status, po.total_value, po.delivery_address, po.note, po.planned_date,
            u.user_id AS seller_id, u.company_name AS seller_name, u.account_type AS seller_type, p.proj_name
       FROM PurchaseOrders po
       JOIN Users u ON u.user_id = po.seller_id
       LEFT JOIN Projects p ON p.proj_id = po.proj_id
      WHERE po.order_id = ? AND po.contractor_id = ?`,
    [Number(req.params.id), req.contractorId]
  );
  if (found.length === 0) return res.status(404).render('orders/missing', { title: 'Order not found' });
  const [lines] = await db.execute(
    `SELECT oi.item_id, oi.quantity, oi.unit_price, oi.line_status, oi.decline_reason, oi.rent_start, oi.rent_end,
            i.item_name, i.unit, i.is_rentable
       FROM OrderItems oi JOIN Items i ON i.item_id = oi.item_id
      WHERE oi.order_id = ?
      ORDER BY i.item_name`,
    [found[0].order_id]
  );
  res.render('orders/show', { title: `Order #${found[0].order_id}`, order: found[0], lines: lines.map(withLineTotal) });
}));

// The money for one saved order line (rentals: from their dates).
function withLineTotal(line) {
  if (!Number(line.is_rentable)) return { ...line, lineTotal: lineCents(line) / 100 };
  const days = rentalDays(dayNumber(isoDay(line.rent_start)), dayNumber(isoDay(line.rent_end)));
  return { ...line, isRental: true, days, basis: rentalBasis(line.unit, days), lineTotal: lineCents(line, days) / 100 };
}

module.exports = router;
