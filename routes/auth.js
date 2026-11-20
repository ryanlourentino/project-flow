// Login and logout.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { SESSION_COOKIE } = require('../middleware/auth');

const router = express.Router();

// The ETL stored passwords with SHA2(..., 256), so we hash the typed password the same way.
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

router.get('/', (req, res) => {
  res.redirect(req.user ? '/dashboard' : '/login');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Log in' });
});

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body.username ?? '').trim();
    const password = String(req.body.password ?? '');

    const [rows] = await db.execute(
      'SELECT user_id, password FROM Users WHERE username = ?',
      [username]
    );
    // One message for "no such user" and "wrong password", so nobody can find out which usernames exist.
    if (rows.length === 0 || rows[0].password !== sha256(password)) {
      return res.status(401).render('login', { title: 'Log in', error: 'Wrong username or password.', username });
    }

    res.cookie(SESSION_COOKIE, String(rows[0].user_id), {
      signed: true,      // sign it with COOKIE_SECRET so it can't be forged
      httpOnly: true,    // JavaScript in the page can't read it
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    });
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/login');
});

module.exports = router;