// Admin: check Suppliers. Approve = the company is legit (Verified badge), with or without an ISO certificate.
// Reject (with a reason) = the Supplier's products are hidden from buyers (see the MarketListings view)
// and the Supplier can no longer add or edit products.
// app.js only lets the Admin in.
const express = require('express');
const db = require('../db');
const { locationOf } = require('../lib/sellers');
const { pageNumber, buildPager, searchPattern } = require('../lib/pager');
const { notify } = require('../lib/notify');
const { adminCounts } = require('../middleware/admin');

const router = express.Router();
const PAGE_SIZE = 10;

// The filter buttons. Each one is a fixed piece of SQL chosen from this list,
// never text from the user, so it can be put into the query safely.
const FILTERS = {
  all:      { label: 'All',                where: 'TRUE' },
  waiting:  { label: 'Waiting for review', where: "s.verification_status = 'Pending' AND s.iso_certification IS NOT NULL" },
  approved: { label: 'Approved',           where: "s.verification_status = 'Approved'" },
  nocert:   { label: 'Not reviewed',       where: "s.verification_status = 'Pending' AND s.iso_certification IS NULL" },
  rejected: { label: 'Rejected',           where: "s.verification_status = 'Rejected'" },
};
const STATUSES = ['Pending', 'Approved', 'Rejected'];
const NOTE_MAX = 255; // Suppliers.review_note is VARCHAR(255)

// READ: one page of Suppliers for the chosen filter and search, plus the count for every filter button.
// rejectId: show that Supplier's row as the "reason for rejecting" form.
async function loadSuppliers(rawFilter, rawQuery, rawPage, rejectId) {
  const filter = FILTERS[rawFilter] ? rawFilter : 'all';
  const { q, like } = searchPattern(rawQuery);
  const search = "(? = '' OR u.company_name LIKE ? OR s.iso_certification LIKE ?)";

  // One query counts every filter at once (SUM of true/false = how many rows are true).
  // The names get a "count_" prefix because ALL is a reserved word in SQL.
  const [[counts]] = await db.execute(
    `SELECT ${Object.entries(FILTERS).map(([key, f]) => `SUM(${f.where}) AS count_${key}`).join(', ')}
       FROM Suppliers s JOIN Users u ON u.user_id = s.user_id
      WHERE ${search}`,
    [q, like, like]
  );

  const from = `FROM Suppliers s JOIN Users u ON u.user_id = s.user_id
               WHERE ${FILTERS[filter].where} AND ${search}`;
  const matches = Number(counts[`count_${filter}`] || 0);
  const totalPages = Math.max(1, Math.ceil(matches / PAGE_SIZE));
  const page = pageNumber(rawPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // Waiting first (they need the Admin), then by name.
  const [rows] = await db.execute(
    `SELECT u.user_id, u.company_name, u.address, s.iso_certification, s.verification_status, s.review_note,
            (SELECT COUNT(*) FROM Listings l WHERE l.seller_id = u.user_id) AS product_count
       ${from}
      ORDER BY (s.verification_status = 'Pending' AND s.iso_certification IS NOT NULL) DESC, u.company_name
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    [q, like, like]
  );

  return {
    q,
    filter,
    page,
    matchCount: matches,
    fromRow: offset + 1,
    toRow: offset + rows.length,
    pager: buildPager(page, totalPages),
    filters: Object.entries(FILTERS).map(([key, f]) => ({
      key, label: f.label, count: Number(counts[`count_${key}`] || 0), active: key === filter,
    })),
    suppliers: rows.map((s) => ({
      ...s,
      location: locationOf(s.address),
      isApproved: s.verification_status === 'Approved',
      isRejected: s.verification_status === 'Rejected',
      isWaiting: s.verification_status === 'Pending' && s.iso_certification !== null,
      canApprove: s.verification_status !== 'Approved', // a certificate helps, but is not required
      rejecting: s.user_id === rejectId,
    })),
  };
}

async function renderResults(req, res, where, opts = {}) {
  res.render('partials/admin-supplier-results', {
    layout: false,
    ...(await loadSuppliers(where.filter, where.q, where.page, opts.rejectId)),
    noteMax: NOTE_MAX,
    adminCounts: await adminCounts(), // fresh numbers for the tabs (sent out of band)
    message: opts.message,
    error: opts.error,
  });
}

const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Admin suppliers error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// Full page (?filter=waiting opens the "Waiting for review" list, e.g. from the Dashboard later)
router.get('/', safe(async (req, res) => {
  res.render('admin/suppliers', { title: 'Suppliers', ...(await loadSuppliers(req.query.filter, '', 1)) });
}));

// Search, filter buttons and pages: only the results part.
router.get('/results', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/admin/suppliers');
  await renderResults(req, res, req.query);
}));

// Show one row as the "reason for rejecting" form.
router.get('/:id(\\d+)/reject', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/admin/suppliers');
  await renderResults(req, res, req.query, { rejectId: Number(req.params.id) });
}));

// UPDATE the verification status: Approved / Rejected / Pending (= undo).
router.put('/:id(\\d+)', safe(async (req, res) => {
  const where = { filter: req.body.filter, q: req.body.q, page: req.body.page };
  const [found] = await db.execute(
    `SELECT u.user_id, u.company_name, s.iso_certification, s.verification_status
       FROM Suppliers s JOIN Users u ON u.user_id = s.user_id
      WHERE u.user_id = ?`,
    [Number(req.params.id)]
  );
  if (found.length === 0) return renderResults(req, res, where, { error: 'That supplier no longer exists.' });
  const supplier = found[0];

  const status = req.body.status;
  if (!STATUSES.includes(status)) return renderResults(req, res, where, { error: 'Unknown status.' });
  if (status === supplier.verification_status) return renderResults(req, res, where);

  // Rejecting needs a reason: the Supplier reads it in My Products.
  let note = null;
  if (status === 'Rejected') {
    note = String(req.body.review_note ?? '').trim();
    if (!note || note.length > NOTE_MAX) {
      return renderResults(req, res, where, {
        error: `Please give a reason (1 to ${NOTE_MAX} characters).`, rejectId: supplier.user_id,
      });
    }
  }

  // Approve and Pending clear an old reason (note = NULL).
  await db.execute('UPDATE Suppliers SET verification_status = ?, review_note = ? WHERE user_id = ?',
    [status, note, supplier.user_id]);
  const text = {
    Approved: 'Your company was verified by Project Flow. Your products now show the Verified badge.',
    Rejected: `Your account was rejected by the Admin: ${note} Your products are hidden from buyers.`,
    Pending: 'Your verification is pending again. Your products are visible to buyers.',
  }[status];
  await notify(db, supplier.user_id, text);

  const done = { Approved: 'approved', Rejected: 'rejected; their products are hidden from buyers', Pending: 'set back to pending' }[status];
  await renderResults(req, res, where, { message: `${supplier.company_name} was ${done}.` });
}));

module.exports = router;
