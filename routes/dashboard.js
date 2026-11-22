// Dashboard: the first page after login. A read-only overview for each account type:
// the account's details, a few numbers ("tiles"), quick buttons and the latest notifications.
const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { adminCounts } = require('../middleware/admin');

const router = express.Router();
const NOTIFICATIONS_SHOWN = 5; // latest notifications on the dashboard

// "$1,234.50", the same format as the {{money}} helper in app.js (here the text is built in JavaScript).
const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const moneyText = (value) => moneyFormat.format(Number(value));
const toCents = (price) => Math.round(Number(price) * 100); // money is added up in cents, like in the cart
const word = (count, one, many) => (Number(count) === 1 ? one : many);

// ---------- Contractor: cart, projects and past purchases ----------
async function contractorData(user) {
  const [contractors] = await db.execute('SELECT contractor_id FROM Contractors WHERE user_id = ?', [user.user_id]);
  const contractorId = contractors[0] ? contractors[0].contractor_id : 0;

  const [cartRows] = await db.execute(
    `SELECT l.price, ci.quantity
       FROM CartItems ci JOIN Listings l ON l.listing_id = ci.listing_id
      WHERE ci.buyer_id = ?`,
    [user.user_id]
  );
  const cartCents = cartRows.reduce((sum, r) => sum + toCents(r.price) * r.quantity, 0);

  // COALESCE(..., 0): SUM of no rows is NULL; show 0 instead.
  const [[projects]] = await db.execute(
    `SELECT COUNT(*) AS total, COALESCE(SUM(proj_phase <> 'Completed'), 0) AS active
       FROM Projects WHERE contractor_id = ?`,
    [contractorId]
  );

  // Past purchases come from the source data (the ETL loaded them as PurchaseOrders).
  const [[orders]] = await db.execute(
    'SELECT COUNT(*) AS total, COALESCE(SUM(total_value), 0) AS spent FROM PurchaseOrders WHERE contractor_id = ?',
    [contractorId]
  );
  const [recentOrders] = await db.execute(
    `SELECT po.order_date, po.order_status, po.total_value, oi.quantity, i.item_id, i.item_name, i.unit
       FROM PurchaseOrders po
       JOIN OrderItems oi ON oi.order_id = po.order_id
       JOIN Items i       ON i.item_id = oi.item_id
      WHERE po.contractor_id = ?
      ORDER BY po.order_date DESC, po.order_id DESC
      LIMIT 5`,
    [contractorId]
  );

  const active = Number(projects.active);
  const orderCount = Number(orders.total);
  return {
    tiles: [
      { label: 'In your cart', value: cartRows.length, unit: word(cartRows.length, 'offer', 'offers'),
        note: cartRows.length ? `Total ${moneyText(cartCents / 100)}` : 'Compare offers and add them', link: '/cart' },
      { label: 'Active projects', value: active, unit: word(active, 'project', 'projects'),
        note: `${projects.total} in total`, link: '/projects' },
      { label: 'Past purchases', value: orderCount, unit: word(orderCount, 'order', 'orders'),
        note: `${moneyText(orders.spent)} in total` },
    ],
    quickLinks: [
      { label: 'Browse categories', href: '/categories', primary: true },
      { label: 'Open cart', href: '/cart' },
      { label: 'My projects', href: '/projects' },
    ],
    recentOrders,
  };
}

// ---------- Supplier / Rental partner: products, buyers' interest, verification ----------
async function sellerData(user) {
  const [[listings]] = await db.execute(
    `SELECT COUNT(*) AS total, COALESCE(SUM(stock > 0), 0) AS on_sale, COALESCE(SUM(stock = 0), 0) AS sold_out
       FROM Listings WHERE seller_id = ?`,
    [user.user_id]
  );
  const [[{ buyers }]] = await db.execute(
    `SELECT COUNT(DISTINCT ci.buyer_id) AS buyers
       FROM CartItems ci JOIN Listings l ON l.listing_id = ci.listing_id
      WHERE l.seller_id = ?`,
    [user.user_id]
  );
  const [[{ waiting }]] = await db.execute(
    'SELECT COUNT(*) AS waiting FROM Items WHERE listed_by = ? AND is_reviewed = FALSE', [user.user_id]);
  const [supplierRows] = await db.execute(
    'SELECT iso_certification, verification_status, review_note FROM Suppliers WHERE user_id = ?', [user.user_id]);
  const supplier = supplierRows[0]; // undefined for a Rental partner (they have no verification yet)

  const onSale = Number(listings.on_sale);
  const tiles = [
    { label: 'On sale', value: onSale, unit: word(onSale, 'product', 'products'),
      note: `${listings.total} listed, ${listings.sold_out} sold out`, link: '/listings' },
    { label: 'In buyers\' carts', value: Number(buyers), unit: word(buyers, 'contractor', 'contractors'),
      note: 'have your products in their cart' },
  ];
  if (supplier) {
    const status = supplier.verification_status;
    let note = supplier.iso_certification || 'No ISO certificate yet';
    if (status === 'Rejected') note = supplier.review_note || 'See My Products';
    tiles.push({ label: 'Verification', text: { Approved: '✓ Verified', Rejected: 'Rejected', Pending: 'Pending' }[status], note });
  } else {
    tiles.push({ label: 'New products', value: Number(waiting), unit: 'waiting',
      note: 'added by you, not reviewed by the Admin yet', link: '/listings' });
  }

  return {
    tiles,
    quickLinks: [
      { label: 'Add a product', href: '/listings', primary: true },
      { label: 'My seller page', href: `/sellers/${user.user_id}` },
      { label: 'Browse categories', href: '/categories' },
    ],
    isRejected: supplier !== undefined && supplier.verification_status === 'Rejected',
  };
}

// ---------- Admin: what is waiting, and the size of the marketplace ----------
async function adminData() {
  const counts = await adminCounts();
  const [[market]] = await db.execute(
    `SELECT (SELECT COUNT(*) FROM Listings) AS listings,
            (SELECT COUNT(*) FROM Suppliers WHERE verification_status = 'Rejected') AS rejected,
            (SELECT COUNT(*) FROM Users WHERE account_type = 'Contractor') AS contractors,
            (SELECT COUNT(*) FROM Users WHERE account_type IN ('Supplier', 'Rental')) AS sellers`
  );
  return {
    tiles: [
      { label: 'Suppliers to review', value: counts.waitingSuppliers, unit: 'waiting',
        note: `${market.rejected} rejected`, link: '/admin/suppliers?filter=waiting' },
      { label: 'New products', value: counts.newProducts, unit: 'waiting',
        note: 'added by sellers', link: '/admin/products' },
      { label: 'Listings', value: Number(market.listings), unit: 'offers',
        note: `${market.sellers} sellers, ${market.contractors} contractors`, link: '/admin/listings' },
    ],
    quickLinks: [
      { label: 'Review suppliers', href: '/admin/suppliers?filter=waiting', primary: true },
      { label: 'New products', href: '/admin/products' },
      { label: 'Manage categories', href: '/categories/manage' },
    ],
  };
}

// The latest notifications, and how many are unread.
async function loadNotifications(userId) {
  const [rows] = await db.execute(
    `SELECT notification_id, message, is_read, created_at
       FROM Notifications WHERE user_id = ?
      ORDER BY created_at DESC, notification_id DESC
      LIMIT ${NOTIFICATIONS_SHOWN}`,
    [userId]
  );
  const [[{ unread }]] = await db.execute(
    'SELECT COUNT(*) AS unread FROM Notifications WHERE user_id = ? AND is_read = FALSE', [userId]);
  return { notifications: rows, unreadCount: Number(unread) };
}

// requireLogin runs first: a visitor who isn't logged in is sent to /login.
router.get('/', requireLogin, async (req, res, next) => {
  try {
    const type = req.user.account_type;
    let data;
    if (type === 'Admin') data = await adminData();
    else if (type === 'Contractor') data = await contractorData(req.user);
    else data = await sellerData(req.user); // Supplier or Rental
    res.render('dashboard', {
      title: 'Dashboard',
      ...data,
      showNotifications: type !== 'Admin', // the Admin sends notifications, but gets none
      ...(await loadNotifications(req.user.user_id)),
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE: mark all notifications as read (HTMX swaps the notifications card).
router.post('/notifications/read', requireLogin, async (req, res) => {
  try {
    await db.execute('UPDATE Notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [req.user.user_id]);
    res.render('partials/dashboard-notifications', { layout: false, ...(await loadNotifications(req.user.user_id)) });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
});

module.exports = router;
