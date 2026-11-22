// Seller page: one Supplier's or Rental partner's profile and every product they offer.
// app.js lets every logged-in user in (buyers check who they buy from).
const express = require('express');
const db = require('../db');
const { locationOf, isVerified } = require('../lib/sellers');

const router = express.Router();

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const [found] = await db.execute(
      `SELECT u.user_id, u.company_name, u.description AS about, u.address, u.account_type,
              s.iso_certification, s.verification_status
         FROM Users u
         LEFT JOIN Suppliers s ON s.user_id = u.user_id
        WHERE u.user_id = ? AND u.account_type IN ('Supplier', 'Rental')`,
      [Number(req.params.id)]
    );
    if (found.length === 0) return res.redirect('/categories'); // not a seller
    const seller = found[0];

    // Every offer of this seller: in stock first, then by category ("Others" last) and product name.
    const [offers] = await db.execute(
      `SELECT l.listing_id, l.price, l.stock, l.min_order, l.lead_days,
              i.item_id, i.item_name, i.unit, i.is_rentable, c.category_name
         FROM Listings l
         JOIN Items i      ON i.item_id = l.item_id
         JOIN Categories c ON c.category_id = i.category_id
        WHERE l.seller_id = ?
        ORDER BY l.stock = 0, c.category_name = 'Others', c.category_name, i.item_name`,
      [seller.user_id]
    );

    const onSaleCount = offers.filter((o) => o.stock > 0).length;
    const categoryCount = new Set(offers.map((o) => o.category_name)).size;
    res.render('sellers/show', {
      title: seller.company_name,
      seller: {
        ...seller,
        isVerified: isVerified(seller),
        isRental: seller.account_type === 'Rental',
        location: locationOf(seller.address),
      },
      offers,
      onSaleCount,
      onSaleLabel: onSaleCount === 1 ? 'product on sale' : 'products on sale',
      categoryCount,
      categoryLabel: categoryCount === 1 ? 'category' : 'categories',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
