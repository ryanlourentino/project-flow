// Admin: review the products that sellers added themselves (Items.is_reviewed = FALSE, the "New" badge).
//   Approve - the product is fine: it becomes a normal catalog product.
//   Edit    - fix the name, unit or category (it stays "New" until approved).
//   Merge   - it is a duplicate: move its listings to the existing product, then delete it.
//   Remove  - it does not belong in the catalog: delete it and its listings.
// Every change notifies the sellers involved. app.js only lets the Admin in.
const express = require('express');
const db = require('../db');
const { notify } = require('../lib/notify');
const { adminCounts } = require('../middleware/admin');

const router = express.Router();
const NAME_MAX = 255; // Items.item_name is VARCHAR(255)
const UNIT_MAX = 20;  // Items.unit is VARCHAR(20)

// READ: every product waiting for review, with who added it and how many listings it has.
// mode = { id, kind: 'edit' | 'merge', values }: show that product as an edit or merge form.
async function loadNewProducts(mode = {}) {
  const [rows] = await db.execute(
    `SELECT i.item_id, i.item_name, i.unit, i.is_rentable, i.category_id, c.category_name,
            u.user_id AS added_by_id, u.company_name AS added_by,
            (SELECT COUNT(*) FROM Listings l WHERE l.item_id = i.item_id) AS listing_count
       FROM Items i
       JOIN Categories c ON c.category_id = i.category_id
       LEFT JOIN Users u ON u.user_id = i.listed_by
      WHERE i.is_reviewed = FALSE
      ORDER BY i.item_id`
  );

  const products = [];
  for (const p of rows) {
    if (p.item_id !== mode.id) {
      products.push(p);
    } else if (mode.kind === 'edit') {
      const typed = mode.values || {};
      const categoryId = Number(typed.category_id ?? p.category_id);
      products.push({
        ...p,
        editing: true,
        editName: typed.item_name ?? p.item_name,
        editUnit: typed.unit ?? p.unit,
        categoryOptions: await loadCategoryOptions(categoryId),
      });
    } else {
      products.push({ ...p, merging: true, ...(await loadMergeTargets(p)) });
    }
  }
  return { products };
}

async function loadCategoryOptions(selectedId) {
  const [rows] = await db.execute(
    `SELECT category_id, category_name FROM Categories ORDER BY category_name = 'Others', category_name`);
  return rows.map((c) => ({ ...c, selected: c.category_id === selectedId }));
}

// Merge targets: the other products of the same category and type (material / rental).
// Names that share the new product's first word come first ("Similar names"), to find the duplicate quickly.
async function loadMergeTargets(product) {
  const firstWord = product.item_name.split(/[\s,-]+/).find((w) => w.length >= 3) || product.item_name;
  const like = `%${firstWord.replace(/[\\%_]/g, '\\$&')}%`;
  const [rows] = await db.execute(
    `SELECT item_id, item_name, unit, item_name LIKE ? AS similar
       FROM Items
      WHERE category_id = ? AND is_rentable = ? AND item_id <> ?
      ORDER BY item_name`,
    [like, product.category_id, product.is_rentable, product.item_id]
  );
  return {
    similarTargets: rows.filter((t) => t.similar),
    otherTargets: rows.filter((t) => !t.similar),
  };
}

// Send the product list (and, out of band, the numbers on the Admin tabs).
async function renderList(req, res, opts = {}) {
  res.render('partials/admin-product-list', {
    layout: false,
    ...(await loadNewProducts(opts.mode)),
    adminCounts: await adminCounts(),
    message: opts.message,
    error: opts.error,
  });
}

// One product that is still waiting for review (an approved or deleted one gives undefined).
async function findNewProduct(id) {
  const [rows] = await db.execute(
    'SELECT item_id, item_name, unit, category_id, is_rentable, listed_by FROM Items WHERE item_id = ? AND is_reviewed = FALSE',
    [id]
  );
  return rows[0];
}

// Who to tell about a change: the seller who added the product and every seller who lists it.
// A Set keeps each seller once.
async function peopleToTell(conn, product) {
  const [rows] = await conn.execute('SELECT DISTINCT seller_id FROM Listings WHERE item_id = ?', [product.item_id]);
  return [...new Set([product.listed_by, ...rows.map((r) => r.seller_id)].filter(Boolean))];
}

const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Admin products error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// Full page
router.get('/', safe(async (req, res) => {
  res.render('admin/products', { title: 'New products', ...(await loadNewProducts()) });
}));

// Cancel (edit or merge): the plain list again.
router.get('/list', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/admin/products');
  await renderList(req, res);
}));

// Show one product as an edit form or as a merge form.
router.get('/:id(\\d+)/:kind(edit|merge)', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/admin/products');
  const product = await findNewProduct(Number(req.params.id));
  if (!product) return renderList(req, res, { error: 'That product was already reviewed or removed.' });
  await renderList(req, res, { mode: { id: product.item_id, kind: req.params.kind } });
}));

// APPROVE: it becomes a normal catalog product (the "New" badge disappears).
router.post('/:id(\\d+)/approve', safe(async (req, res) => {
  const product = await findNewProduct(Number(req.params.id));
  if (!product) return renderList(req, res, { error: 'That product was already reviewed or removed.' });
  await db.execute('UPDATE Items SET is_reviewed = TRUE WHERE item_id = ?', [product.item_id]);
  await notify(db, product.listed_by, `Your new product "${product.item_name}" was approved and is now part of the catalog.`);
  await renderList(req, res, { message: `"${product.item_name}" was approved.` });
}));

// UPDATE: fix the name, unit or category.
router.put('/:id(\\d+)', safe(async (req, res) => {
  const product = await findNewProduct(Number(req.params.id));
  if (!product) return renderList(req, res, { error: 'That product was already reviewed or removed.' });
  const keepOpen = (error) => renderList(req, res, { error, mode: { id: product.item_id, kind: 'edit', values: req.body } });

  const name = String(req.body.item_name ?? '').trim().replace(/\s+/g, ' ');
  const unit = String(req.body.unit ?? '').trim();
  const categoryId = Number(req.body.category_id);
  if (!name || name.length > NAME_MAX) return keepOpen(`Name must be 1 to ${NAME_MAX} characters.`);
  if (!unit || unit.length > UNIT_MAX) return keepOpen(`Unit must be 1 to ${UNIT_MAX} characters.`);
  const [categories] = await db.execute('SELECT category_id FROM Categories WHERE category_id = ?',
    [Number.isInteger(categoryId) ? categoryId : 0]);
  if (categories.length === 0) return keepOpen('Please choose a category.');
  // Another product with the same name (upper/lower case ignored)? Then Merge is the right tool.
  const [same] = await db.execute('SELECT item_name FROM Items WHERE item_name = ? AND item_id <> ?', [name, product.item_id]);
  if (same.length > 0) return keepOpen(`"${same[0].item_name}" already exists. Use Merge instead.`);

  await db.execute('UPDATE Items SET item_name = ?, unit = ?, category_id = ? WHERE item_id = ?',
    [name, unit, categoryId, product.item_id]);
  if (name !== product.item_name) {
    for (const sellerId of await peopleToTell(db, product)) {
      await notify(db, sellerId, `The Admin renamed your product "${product.item_name}" to "${name}".`);
    }
  }
  await renderList(req, res, { message: `"${name}" was saved. Approve it when it is ready.` });
}));

// MERGE into an existing product: move the listings, then delete the duplicate.
router.post('/:id(\\d+)/merge', safe(async (req, res) => {
  const product = await findNewProduct(Number(req.params.id));
  if (!product) return renderList(req, res, { error: 'That product was already reviewed or removed.' });
  const [targets] = await db.execute(
    'SELECT item_id, item_name FROM Items WHERE item_id = ? AND item_id <> ? AND is_rentable = ?',
    [Number(req.body.target_id) || 0, product.item_id, product.is_rentable]
  );
  if (targets.length === 0) {
    return renderList(req, res, { error: 'Please choose the product to merge into.', mode: { id: product.item_id, kind: 'merge' } });
  }
  const target = targets[0];

  // Several statements that belong together: all of them happen, or none (ROLLBACK).
  const conn = await db.getConnection();
  let removed;
  let moved;
  try {
    await conn.beginTransaction();
    const sellers = await peopleToTell(conn, product);
    // Sellers who already list the target product (their duplicate listing will be removed in step 1).
    const [already] = await conn.execute(
      'SELECT seller_id FROM Listings WHERE item_id = ? AND seller_id IN (SELECT seller_id FROM Listings WHERE item_id = ?)',
      [target.item_id, product.item_id]
    );
    const alreadyListing = new Set(already.map((r) => r.seller_id));
    // 1. A seller who already lists the target keeps that listing; their duplicate listing goes.
    //    (UNIQUE (item_id, seller_id) would refuse a second listing of the same product.)
    const [deleted] = await conn.execute(
      `DELETE dup FROM Listings dup
         JOIN Listings keep ON keep.seller_id = dup.seller_id AND keep.item_id = ?
        WHERE dup.item_id = ?`,
      [target.item_id, product.item_id]
    );
    removed = deleted.affectedRows; // affectedRows = how many rows the statement changed
    // 2. Every other listing moves to the target product.
    const [updated] = await conn.execute('UPDATE Listings SET item_id = ? WHERE item_id = ?',
      [target.item_id, product.item_id]);
    moved = updated.affectedRows;
    // 3. Order lines too (none yet, but ordering comes in Assignment #5).
    await conn.execute('UPDATE OrderItems SET item_id = ? WHERE item_id = ?', [target.item_id, product.item_id]);
    // 4. The duplicate product itself.
    await conn.execute('DELETE FROM Items WHERE item_id = ?', [product.item_id]);
    for (const sellerId of sellers) {
      const what = alreadyListing.has(sellerId)
        ? 'You already list that product, so your second listing was removed.'
        : 'Your listing is now under that name.';
      await notify(conn, sellerId, `"${product.item_name}" was already in the catalog as "${target.item_name}". ${what}`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const parts = [`${moved} ${moved === 1 ? 'listing' : 'listings'} moved`];
  if (removed) parts.push(`${removed} duplicate ${removed === 1 ? 'listing' : 'listings'} removed (the seller already listed it)`);
  await renderList(req, res, { message: `"${product.item_name}" was merged into "${target.item_name}": ${parts.join(', ')}.` });
}));

// REMOVE: delete the product and its listings.
router.delete('/:id(\\d+)', safe(async (req, res) => {
  const product = await findNewProduct(Number(req.params.id));
  if (!product) return renderList(req, res, { error: 'That product was already reviewed or removed.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const sellers = await peopleToTell(conn, product);
    await conn.execute('DELETE FROM Listings WHERE item_id = ?', [product.item_id]); // cart lines go too (CASCADE)
    await conn.execute('DELETE FROM Items WHERE item_id = ?', [product.item_id]);
    for (const sellerId of sellers) {
      await notify(conn, sellerId,
        `The Admin removed the product "${product.item_name}" from the catalog (and any listing of it).`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_ROW_IS_REFERENCED_2') { // an order uses it
      return renderList(req, res, { error: `"${product.item_name}" is part of an order, so it can't be removed. Use Merge instead.` });
    }
    throw err;
  } finally {
    conn.release();
  }
  await renderList(req, res, { message: `"${product.item_name}" and its listings were removed.` });
}));

module.exports = router;
