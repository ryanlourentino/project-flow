-- Demo offers, so the marketplace has data to browse and compare.
-- Every demo row has the description 'Demo listing'. Prices are spread around the market
-- average with RAND(seed). The seed is a hash (CRC32) of item, seller and field, so every
-- offer gets different numbers, but the same numbers on every computer.
-- Safe to run again: offers that already exist are skipped (NOT EXISTS).
USE projectflow;

-- 1. The demo Supplier lists the first 25 materials at 5% above the market average.
INSERT INTO Listings (item_id, seller_id, price, stock, description)
SELECT i.item_id, u.user_id, GREATEST(ROUND(i.avg_price * 1.05, 2), 1), 100, 'Demo listing'
  FROM Items i
  JOIN Users u ON u.username = 'superior_foundations_99_28001683'
 WHERE i.item_id IN (SELECT item_id FROM (SELECT item_id FROM Items WHERE is_rentable = 0
                                           ORDER BY item_id LIMIT 25) AS first25)
   AND NOT EXISTS (SELECT 1 FROM Listings x WHERE x.item_id = i.item_id AND x.seller_id = u.user_id);

-- 2. Three more Suppliers offer the same 25 materials: price -10% to +15% of the average,
--    stock 10-199 (about 1 in 10 sold out), minimum order 1-10, lead time 0-7 days.
INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
SELECT i.item_id, s.user_id,
       GREATEST(ROUND(i.avg_price * (0.90 + 0.25 * RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-1000')))), 2), 1),
       IF(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-2000'))) < 0.1, 0, 10 + FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-2500'))) * 190)),
       1 + FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-3000'))) * 10),
       FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-4000'))) * 8),
       'Demo listing'
  FROM Items i
 CROSS JOIN (SELECT user_id FROM Users
              WHERE account_type = 'Supplier' AND username <> 'superior_foundations_99_28001683'
              ORDER BY user_id LIMIT 3) AS s
 WHERE i.item_id IN (SELECT item_id FROM (SELECT item_id FROM Items WHERE is_rentable = 0
                                           ORDER BY item_id LIMIT 25) AS first25)
   AND NOT EXISTS (SELECT 1 FROM Listings x WHERE x.item_id = i.item_id AND x.seller_id = s.user_id);

-- 3. The first three Rental partners offer the first 12 rentable items.
INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
SELECT i.item_id, r.user_id,
       GREATEST(ROUND(i.avg_price * (0.85 + 0.30 * RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-5000')))), 2), 1),
       1 + FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-6000'))) * 5),
       1,
       FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-7000'))) * 4),
       'Demo listing'
  FROM Items i
 CROSS JOIN (SELECT user_id FROM Users WHERE account_type = 'Rental'
              ORDER BY user_id LIMIT 3) AS r
 WHERE i.item_id IN (SELECT item_id FROM (SELECT item_id FROM Items WHERE is_rentable = 1
                                           ORDER BY item_id LIMIT 12) AS first12)
   AND NOT EXISTS (SELECT 1 FROM Listings x WHERE x.item_id = i.item_id AND x.seller_id = r.user_id);