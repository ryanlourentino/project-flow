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
      ORDER BY c.category_name = 'Others', c.category_name`
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

// Search text: trimmed, at most 100 characters, plus a LIKE pattern for "contains".
// In LIKE, % and _ are wildcards; a backslash makes them normal characters.
function searchPattern(raw) {
  const q = String(raw ?? '').trim().slice(0, 100);
  return { q, like: `%${q.replace(/[\\%_]/g, '\\$&')}%` };
}

// BROWSE: category cards. A search matches the category name, its description,
// or the name of a product inside it (match_count = how many products match).
async function loadCategoryCards(rawQuery) {
  const { q, like } = searchPattern(rawQuery);
  const [rows] = await db.execute(
    `SELECT c.category_id, c.category_name, c.description,
            COUNT(DISTINCT i.item_id) AS item_count,
            COUNT(DISTINCT l.item_id) AS offered_count,
            COUNT(DISTINCT CASE WHEN ? <> '' AND i.item_name LIKE ? THEN i.item_id END) AS match_count
       FROM Categories c
       LEFT JOIN Items i    ON i.category_id = c.category_id
       LEFT JOIN MarketListings l ON l.item_id = i.item_id AND l.stock > 0 -- MarketListings: no rejected sellers
      GROUP BY c.category_id, c.category_name, c.description
     HAVING ? = '' OR c.category_name LIKE ? OR c.description LIKE ? OR match_count > 0
      ORDER BY c.category_name = 'Others', c.category_name`,
    [q, like, q, like, like]
  );
  return {
    q,
    categories: rows.map((c) => ({
      ...c,
      // If products matched, open the category with the same search already filled in.
      link: `/categories/${c.category_id}` + (Number(c.match_count) > 0 ? `?q=${encodeURIComponent(q)}` : ''),
    })),
  };
}

// The products of one category, optionally filtered by a search text. For each product:
// how many sellers offer it in stock, and the lowest price among them.
async function loadCategoryItems(categoryId, rawQuery) {
  const { q, like } = searchPattern(rawQuery);
  const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM Items WHERE category_id = ?', [categoryId]);

  // LEFT JOIN keeps products that nobody sells yet (offer_count 0, lowest_price NULL).
  // "AND l.stock > 0" is in the ON part, so sold-out offers are left out of the count and the minimum.
  const [items] = await db.execute(
    `SELECT i.item_id, i.item_name, i.unit, i.avg_price, i.is_rentable, i.is_reviewed,
            COUNT(l.listing_id) AS offer_count, MIN(l.price) AS lowest_price
       FROM Items i
       LEFT JOIN MarketListings l ON l.item_id = i.item_id AND l.stock > 0
      WHERE i.category_id = ? AND (? = '' OR i.item_name LIKE ?)
      GROUP BY i.item_id, i.item_name, i.unit, i.avg_price, i.is_rentable, i.is_reviewed
      ORDER BY COUNT(l.listing_id) = 0, i.item_name`,
    [categoryId, q, like]
  );
  return {
    q,
    items,
    totalItems: Number(total),
    offeredCount: items.filter((i) => Number(i.offer_count) > 0).length,
  };
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

// BROWSE page: category cards with a search box (everyone who is logged in)
router.get('/', safe(async (req, res) => {
  res.render('categories/index', { title: 'Categories', ...(await loadCategoryCards(req.query.q)) });
}));

// Search box on the browse page: only the cards (HTMX swaps them)
router.get('/search', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/categories'); // typed in the address bar
  res.render('partials/category-cards', { layout: false, ...(await loadCategoryCards(req.query.q)) });
}));

// MANAGE page: the table with add / edit / delete (Admin only)
router.get('/manage', adminOnly, safe(async (req, res) => {
  res.render('categories/manage', {
    title: 'Manage categories',
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
  if (!req.get('HX-Request')) return res.redirect('/categories/manage'); // typed in the address bar
  await renderList(res);
}));

// Show one row as an edit form
router.get('/:id(\\d+)/edit', adminOnly, safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/categories/manage'); // typed in the address bar
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

// One category and its products, with a search box (everyone who is logged in).
// ?q=... (from a search on the browse page) fills in the search box.
router.get('/:id(\\d+)', safe(async (req, res) => {
  const id = Number(req.params.id);
  const [found] = await db.execute(
    'SELECT category_id, category_name, description FROM Categories WHERE category_id = ?',
    [id]
  );
  if (found.length === 0) return res.redirect('/categories');
  res.render('categories/show', {
    title: found[0].category_name,
    category: found[0],
    ...(await loadCategoryItems(id, req.query.q)),
  });
}));

// Search box on a category page: only the product table (HTMX swaps it)
router.get('/:id(\\d+)/items', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect(`/categories/${Number(req.params.id)}`);
  res.render('partials/category-items', {
    layout: false,
    ...(await loadCategoryItems(Number(req.params.id), req.query.q)),
  });
}));

module.exports = router;