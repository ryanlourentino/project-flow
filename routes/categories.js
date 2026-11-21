const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('Admin'); // only Admin may add, edit or delete
const NAME_MAX = 50;  // Categories.category_name is VARCHAR(50)
const DESC_MAX = 255; // Categories.description is VARCHAR(255)

// READ: all categories with the number of items in each.
async function loadCategories() {
  const [rows] = await db.execute(
    `SELECT c.category_id, c.category_name, c.description, COUNT(i.item_id) AS item_count
       FROM Categories c
       LEFT JOIN Items i ON i.category_id = c.category_id
      GROUP BY c.category_id, c.category_name, c.description
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
    editDescription: opts.editDescription ?? c.description ?? '',
  }));
}

// Send only the list fragment (the part HTMX swaps into the page).
// Options: message / error (shown above the table), newName + newDescription (kept in the "add" boxes),
// editId (the row shown as an edit form) with editValue + editDescription (the text in its inputs).
async function renderList(res, opts = {}) {
  res.render('partials/category-list', {
    layout: false,
    categories: withFlags(await loadCategories(), opts),
    message: opts.message,
    error: opts.error,
    newName: opts.newName,
    newDescription: opts.newDescription,
    nameMax: NAME_MAX,
    descMax: DESC_MAX,
  });
}

// Trim, collapse repeated spaces and validate a name typed by the user.
function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Category name is required.' };
  if (name.length > NAME_MAX) return { error: `Category name must be at most ${NAME_MAX} characters.` };
  return { name };
}

// The description is optional: an empty box is saved as NULL (no description).
function cleanDescription(raw) {
  const description = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (description.length > DESC_MAX) return { error: `Description must be at most ${DESC_MAX} characters.` };
  return { description: description || null };
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
    descMax: DESC_MAX,
  });
}));

// CREATE
router.post('/', adminOnly, safe(async (req, res) => {
  const keep = { newName: req.body.name, newDescription: req.body.description };
  const { name, error } = cleanName(req.body.name);
  if (error) return renderList(res, { error, ...keep });
  const { description, error: descError } = cleanDescription(req.body.description);
  if (descError) return renderList(res, { error: descError, ...keep });

  try {
    await db.execute(
      'INSERT INTO Categories (category_name, description) VALUES (?, ?)',
      [name, description]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderList(res, { error: `Category "${name}" already exists.`, ...keep });
    }
    throw err;
  }
  await renderList(res, { message: `Category "${name}" was added.` });
}));

// Fragment only (used by the Cancel button)
router.get('/list', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/categories'); // typed in the address bar
  await renderList(res);
}));

// Show one row as an edit form
router.get('/:id(\\d+)/edit', adminOnly, safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/categories'); // typed in the address bar
  await renderList(res, { editId: Number(req.params.id) });
}));

// UPDATE (name and description)
router.put('/:id(\\d+)', adminOnly, safe(async (req, res) => {
  const id = Number(req.params.id);
  const [found] = await db.execute('SELECT category_id FROM Categories WHERE category_id = ?', [id]);
  if (found.length === 0) return renderList(res, { error: 'That category no longer exists.' });

  // If something is wrong, show the same row in edit mode again with what the user typed.
  const keep = { editId: id, editValue: req.body.name, editDescription: req.body.description };
  const { name, error } = cleanName(req.body.name);
  if (error) return renderList(res, { error, ...keep });
  const { description, error: descError } = cleanDescription(req.body.description);
  if (descError) return renderList(res, { error: descError, ...keep });

  try {
    await db.execute(
      'UPDATE Categories SET category_name = ?, description = ? WHERE category_id = ?',
      [name, description, id]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderList(res, { error: `Category "${name}" already exists.`, ...keep });
    }
    throw err;
  }
  await renderList(res, { message: `Category "${name}" was saved.` });
}));

// DELETE (refused while the category still has items)
router.delete('/:id(\\d+)', adminOnly, safe(async (req, res) => {
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

// One category and its items (the marketplace browse page). Everyone who is logged in can see it.
router.get('/:id(\\d+)', safe(async (req, res) => {
  const id = Number(req.params.id);
  const [found] = await db.execute(
    'SELECT category_id, category_name, description FROM Categories WHERE category_id = ?',
    [id]
  );
  if (found.length === 0) return res.redirect('/categories');

  const [items] = await db.execute(
    `SELECT item_id, item_name, unit, avg_price, is_rentable
       FROM Items
      WHERE category_id = ?
      ORDER BY item_name`,
    [id]
  );
  res.render('categories/show', {
    title: found[0].category_name,
    category: found[0],
    items,
  });
}));

module.exports = router;