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

// Add the flags the template needs to every category.
function withFlags(rows, opts = {}) {
  return rows.map((c) => ({
    ...c,
    canDelete: Number(c.item_count) === 0,
    editing: c.category_id === opts.editId,
    editValue: opts.editValue ?? c.category_name,
  }));
}

// Send only the list fragment (the part HTMX swaps into the page).
// Options: message / error (shown above the table), newName (kept in the "add" box),
// editId (the row shown as an edit form) and editValue (the text in its input).
async function renderList(res, opts = {}) {
  res.render('partials/category-list', {
    layout: false,
    categories: withFlags(await loadCategories(), opts),
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
        categories: withFlags(await loadCategories()),
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

// Fragment only (used by the Cancel button)
router.get('/list', safe(async (req, res) => {
  await renderList(res);
}));

// Show one row as an edit form
router.get('/:id(\\d+)/edit', safe(async (req, res) => {
  await renderList(res, { editId: Number(req.params.id) });
}));

// UPDATE
router.put('/:id(\\d+)', safe(async (req, res) => {
  const id = Number(req.params.id);
  const [found] = await db.execute('SELECT category_id FROM Categories WHERE category_id = ?', [id]);
  if (found.length === 0) return renderList(res, { error: 'That category no longer exists.' });

  const { name, error } = cleanName(req.body.name);
  if (error) return renderList(res, { error, editId: id, editValue: req.body.name });
  try {
    await db.execute('UPDATE Categories SET category_name = ? WHERE category_id = ?', [name, id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderList(res, { error: `Category "${name}" already exists.`, editId: id, editValue: name });
    }
    throw err;
  }
  await renderList(res, { message: `Category renamed to "${name}".` });
}));

// DELETE (refused while the category still has items)
router.delete('/:id(\\d+)', safe(async (req, res) => {
  const id = Number(req.params.id);
  const [found] = await db.execute(
    `SELECT c.category_name, COUNT(i.item_id) AS item_count
       FROM Categories c LEFT JOIN Items i ON i.category_id = c.category_id
      WHERE c.category_id = ? GROUP BY c.category_id, c.category_name`,
    [id]
  );
  if (found.length === 0) return renderList(res, { error: 'That category no longer exists.' });

  const { category_name: name, item_count: count } = found[0];
  if (Number(count) > 0) {
    return renderList(res, { error: `Cannot delete "${name}": it still has ${count} item(s).` });
  }
  try {
    await db.execute('DELETE FROM Categories WHERE category_id = ?', [id]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return renderList(res, { error: `Cannot delete "${name}": it is still in use.` });
    }
    throw err;
  }
  await renderList(res, { message: `Category "${name}" was deleted.` });
}));

module.exports = router;