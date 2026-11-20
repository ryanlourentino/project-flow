const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.category_id, c.category_name, COUNT(i.item_id) AS item_count
         FROM Categories c
         LEFT JOIN Items i ON i.category_id = c.category_id
        GROUP BY c.category_id, c.category_name
        ORDER BY c.category_name`
    );
    res.render('categories/index', { title: 'Categories', categories: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;