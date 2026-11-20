// First page after login.
const express = require('express');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// requireLogin runs first: a visitor who isn't logged in is sent to /login.
router.get('/', requireLogin, (req, res) => {
  res.render('dashboard', { title: 'Dashboard' });
});

module.exports = router;