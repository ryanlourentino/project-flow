// Login helpers: a signed cookie remembers who is logged in.
// The cookie only holds the user_id. The user is loaded from the database on every
// request, so a change to the account (e.g. its type) applies immediately.
const db = require('../db');

const SESSION_COOKIE = 'session';

// Runs on every request: puts the logged-in user (or null) into req.user and into the views.
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.user = null;

  const id = Number(req.signedCookies[SESSION_COOKIE]);
  if (!Number.isInteger(id) || id <= 0) return next();

  try {
    const [rows] = await db.execute(
      `SELECT user_id, username, company_name, email, phone, address, account_type
         FROM Users WHERE user_id = ?`,
      [id]
    );
    if (rows[0]) {
      req.user = rows[0];
      res.locals.user = rows[0];
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { SESSION_COOKIE, loadUser };