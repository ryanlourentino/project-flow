// One shared connection pool for the whole app.
// Usage in a route:  const db = require('../db');
//                    const [rows] = await db.execute('SELECT * FROM Categories WHERE category_id = ?', [id]);
// Always use "?" placeholders (prepared statements) to prevent SQL injection.
const mysql = require('mysql2/promise');
const config = require('./config');

module.exports = mysql.createPool(config.db);
