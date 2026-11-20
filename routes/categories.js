const express = require('express');
const db = require('../db');

const router = express.Router();
const NAME_MAX = 50; // Categories.category_name is VARCHAR(50)

// READ: all categories with the number of items in each.
async function loadCategories() {
  const [rows] = await db.execute(
    `SELECT c.category_id, c.category_name, COUNT(i.item_id) AS item_count
       FROM Categories c
       LEFT JOIN Items i ON i.category_id = c.category_id
      GROUP BY c.category_id, c.category_name
      ORDER BY c.category_name`
  );
  return rows;
}

// Send only the list fragment (the part HTMX swaps into the page).
async function renderList(res, opts = {}) {
  res.render('partials/category-list', {
    layout: false,
    categories: await loadCategories(),
    message: opts.message,
    error: opts.error,
    newName: opts.newName,
    nameMax: NAME_MAX,
  });
}

// Trim, collapse repeated spaces and validate a name typed by the user.
function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Category name is required.' };
  if (name.length > NAME_MAX) return { error: `Category name must be at most ${NAME_MAX} characters.` };
  return { name };
}

// Wrap every handler: an unexpected error is logged and shown as a message instead of crashing.
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Categories error:', err);
    try {
      await renderList(res, { error: 'Something went wrong. Please try again.' });
    } catch (err2) {
      res.status(500).send('Database error');
    }
  }
};

// Full page
router.get('/', safe(async (req, res) => {
  res.render('categories/index', {
    title: 'Categories',
    categories: await loadCategories(),
    nameMax: NAME_MAX,
  });
}));

// CREATE
router.post('/', safe(async (req, res) => {
  const { name, error } = cleanName(req.body.name);
  if (error) return renderList(res, { error, newName: req.body.name });
  try {
    await db.execute('INSERT INTO Categories (category_name) VALUES (?)', [name]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderList(res, { error: `Category "${name}" already exists.`, newName: name });
    }
    throw err;
  }
  await renderList(res, { message: `Category "${name}" was added.` });
}));

module.exports = router;