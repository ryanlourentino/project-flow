// The numbers on the Admin tabs (views/partials/admin-tabs.hbs): what is waiting for the Admin.
const db = require('../db');

async function adminCounts() {
  const [[counts]] = await db.execute(
    `SELECT (SELECT COUNT(*) FROM Suppliers
              WHERE verification_status = 'Pending' AND iso_certification IS NOT NULL) AS waiting_suppliers,
            (SELECT COUNT(*) FROM Items WHERE is_reviewed = FALSE) AS new_products`
  );
  return { waitingSuppliers: Number(counts.waiting_suppliers), newProducts: Number(counts.new_products) };
}

// Middleware for the Admin pages: puts the numbers into the views (res.locals.adminCounts).
async function loadAdminCounts(req, res, next) {
  if (!req.user || req.user.account_type !== 'Admin') return next(); // the page's own guard answers
  try {
    res.locals.adminCounts = await adminCounts();
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { adminCounts, loadAdminCounts };
