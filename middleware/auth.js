// Login helpers: a signed cookie remembers who is logged in.
// The cookie only holds the user_id. The user is loaded from the database on every
// request, so a change to the account (e.g. its type) applies immediately.
const db = require('../db');

const SESSION_COOKIE = 'session';

// A normal redirect would put the login page inside an HTMX fragment.
// HX-Redirect tells HTMX to navigate the whole browser instead.
function redirect(req, res, url) {
  if (req.get('HX-Request')) {
    res.set('HX-Redirect', url);
    return res.status(200).end();
  }
  return res.redirect(url);
}

// Runs on every request: puts the logged-in user (or null) into req.user and into the views.
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  res.locals.isAdmin = false;
  res.locals.isSeller = false;
  res.locals.isBuyer = false;
  res.locals.cartCount = 0;

  const id = Number(req.signedCookies[SESSION_COOKIE]);
  if (!Number.isInteger(id) || id <= 0) return next();

  try {
    const [rows] = await db.execute(
      `SELECT user_id, username, company_name, email, phone, address, account_type
         FROM Users WHERE user_id = ?`,
      [id]
    );
    if (rows[0]) {
      const type = rows[0].account_type;
      req.user = rows[0];
      res.locals.user = rows[0];
      res.locals.isAdmin = type === 'Admin';
      res.locals.isSeller = type === 'Supplier' || type === 'Rental';
      res.locals.isBuyer = type === 'Contractor';
      if (res.locals.isBuyer) {
        // The number on the Cart badge in the menu.
        const [[{ line_count: lineCount }]] = await db.execute(
          'SELECT COUNT(*) AS line_count FROM CartItems WHERE buyer_id = ?', [rows[0].user_id]);
        res.locals.cartCount = Number(lineCount);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Guard: must be logged in.
function requireLogin(req, res, next) {
  if (!req.user) return redirect(req, res, '/login');
  next();
}

// Guard: must be logged in AND have one of the given account types.
// Example: app.use('/categories', requireRole('Admin'), require('./routes/categories'))
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return redirect(req, res, '/login');
    if (!roles.includes(req.user.account_type)) {
      if (req.get('HX-Request')) return redirect(req, res, '/dashboard');
      return res.status(403).render('forbidden', { title: 'No access' });
    }
    next();
  };
}

module.exports = { SESSION_COOKIE, loadUser, requireLogin, requireRole };