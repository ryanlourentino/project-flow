// One catalog item and every seller's offer for it, cheapest first: the buyer's price comparison.
// app.js only lets logged-in users in (requireLogin).
const express = require('express');
const db = require('../db');
const { locationOf, isVerified } = require('../lib/sellers');

const router = express.Router();

// "4% below avg." / "12% above avg." compared with the market average from the ETL data.
function compareWithAverage(price, average) {
  const avg = Number(average);
  if (!(avg > 0)) return { text: '', below: false };
  const percent = Math.round(((Number(price) - avg) / avg) * 100);
  if (percent === 0) return { text: 'same as avg.', below: false };
  return { text: `${Math.abs(percent)}% ${percent < 0 ? 'below' : 'above'} avg.`, below: percent < 0 };
}

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const [found] = await db.execute(
      `SELECT i.item_id, i.item_name, i.unit, i.avg_price, i.is_rentable, i.is_reviewed, c.category_id, c.category_name
         FROM Items i
         JOIN Categories c ON c.category_id = i.category_id
        WHERE i.item_id = ?`,
      [Number(req.params.id)]
    );
    if (found.length === 0) return res.redirect('/categories');
    const item = found[0];

    // In-stock offers first (stock = 0 is false = 0, sorts first), then cheapest, then fastest.
    // With each offer: the seller's About text, address (for the city), certificate and status,
    // and how many products the seller has on sale (a subquery per seller).
    const [rows] = await db.execute(
      `SELECT l.listing_id, l.seller_id, l.price, l.stock, l.min_order, l.lead_days, l.description,
              u.company_name, u.description AS about, u.address,
              s.iso_certification, s.verification_status,
              (SELECT COUNT(*) FROM Listings x WHERE x.seller_id = l.seller_id AND x.stock > 0) AS products_on_sale
         FROM Listings l
         JOIN Users u          ON u.user_id = l.seller_id
         LEFT JOIN Suppliers s ON s.user_id = l.seller_id
        WHERE l.item_id = ?
        ORDER BY l.stock = 0, l.price, l.lead_days`,
      [item.item_id]
    );

    // "Verified sellers only" filter (materials only: Rental partners have no verification yet).
    const verifiedOnly = req.query.verified === '1' && !item.is_rentable;
    const shown = verifiedOnly ? rows.filter(isVerified) : rows;

    const offers = shown.map((o, index) => {
      const comparison = compareWithAverage(o.price, item.avg_price);
      return {
        ...o,
        isMine: o.seller_id === req.user.user_id,      // the seller sees their own offer marked "You"
        isCheapest: index === 0 && o.stock > 0,        // the first row is the cheapest in-stock offer
        compareText: comparison.text,
        isBelowAvg: comparison.below,
        isVerified: isVerified(o),
        location: locationOf(o.address),
      };
    });

    res.render('items/show', {
      title: item.item_name,
      item,
      offers,
      inStockCount: offers.filter((o) => o.stock > 0).length,
      verifiedOnly,
      allCount: rows.length,
      verifiedCount: rows.filter(isVerified).length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;