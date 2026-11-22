-- Demo offers, so the marketplace has data to browse and compare.
-- About 20 Suppliers and all Rental partners each offer a random share of the catalog, so most
-- products have several offers. The descriptions are made-up sample text, built from short
-- phrases per category. Prices are spread around the market average with RAND(seed).
-- The seed is a hash (CRC32) of item, seller and field, so every offer gets different
-- numbers, but the same numbers on every computer. Safe to run again (NOT EXISTS).
USE projectflow;

-- Sample sentences: 3 per category (picked per offer) and 4 delivery terms (picked per seller).
-- TEMPORARY tables exist only while this file runs.
CREATE TEMPORARY TABLE demo_phrases (category_name VARCHAR(50), n INT, phrase VARCHAR(200));
INSERT INTO demo_phrases VALUES
  ('Aggregates & Soil', 1, 'Washed and graded; sieve analysis report on request.'),
  ('Aggregates & Soil', 2, 'From our own quarry, with consistent grading.'),
  ('Aggregates & Soil', 3, 'Delivered by dump truck; minimum one truckload.'),
  ('Asphalt & Paving', 1, 'Batch tested in our lab; test report on request.'),
  ('Asphalt & Paving', 2, 'Night delivery possible for road works.'),
  ('Asphalt & Paving', 3, 'Stored on pallets and shrink-wrapped against moisture.'),
  ('Concrete & Cement', 1, 'Mill test certificate supplied with every delivery.'),
  ('Concrete & Cement', 2, 'Fresh from our batching plant; slump tested on site.'),
  ('Concrete & Cement', 3, 'Stored dry on pallets, at most 30 days from production.'),
  ('Formwork & Timber', 1, 'Kiln-dried and treated against moisture.'),
  ('Formwork & Timber', 2, 'Reusable up to 8 times with proper care.'),
  ('Formwork & Timber', 3, 'Cut to size on request.'),
  ('Landscaping', 1, 'Grown in our own nursery and delivered fresh.'),
  ('Landscaping', 2, 'Planting service available on request.'),
  ('Landscaping', 3, 'Seasonal stock; ask about prices for large areas.'),
  ('Machines', 1, 'Operator included; fuel charged separately.'),
  ('Machines', 2, 'Machine serviced after every rental.'),
  ('Machines', 3, 'Delivered to site on a low-bed trailer.'),
  ('Others', 1, 'First-grade quality; samples available.'),
  ('Others', 2, 'Matching accessories in stock.'),
  ('Others', 3, 'Installation guide included.'),
  ('Pipes & Drainage', 1, 'Pressure-tested at the factory; fittings available.'),
  ('Pipes & Drainage', 2, 'Delivered on our own truck with crane unloading.'),
  ('Pipes & Drainage', 3, 'Matching gaskets and joints in stock.'),
  ('Safety & Site Equipment', 1, 'Meets current occupational safety standards.'),
  ('Safety & Site Equipment', 2, 'Delivered and set up by our crew.'),
  ('Safety & Site Equipment', 3, 'Bulk packs available for large sites.'),
  ('Steel & Metal', 1, 'Mill test certificate included; cut to length on request.'),
  ('Steel & Metal', 2, 'Stored indoors to prevent rust.'),
  ('Steel & Metal', 3, 'Bundled and tagged per size for easy handling on site.');

CREATE TEMPORARY TABLE demo_delivery (n INT, phrase VARCHAR(200));
INSERT INTO demo_delivery VALUES
  (1, 'Delivery to the city and nearby counties.'),
  (2, 'Free delivery for orders over $5,000.'),
  (3, 'Pickup from our yard is possible.'),
  (4, 'Delivery within 50 km of our depot.');

-- 1. The demo Supplier lists the first 25 materials at 5% above the market average.
INSERT INTO Listings (item_id, seller_id, price, stock, description)
SELECT i.item_id, u.user_id, GREATEST(ROUND(i.avg_price * 1.05, 2), 1), 100,
       CONCAT(dp.phrase, ' ', dd.phrase)
  FROM Items i
  JOIN Categories c   ON c.category_id = i.category_id
  JOIN Users u        ON u.username = 'superior_foundations_99_28001683'
  JOIN demo_phrases dp ON dp.category_name = c.category_name
                      AND dp.n = 1 + CRC32(CONCAT(i.item_id, '-', u.user_id, '-text')) % 3
  JOIN demo_delivery dd ON dd.n = 1 + CRC32(CONCAT(u.user_id, '-delivery')) % 4
 WHERE i.item_id IN (SELECT item_id FROM (SELECT item_id FROM Items WHERE is_rentable = 0
                                           ORDER BY item_id LIMIT 25) AS first25)
   AND NOT EXISTS (SELECT 1 FROM Listings x WHERE x.item_id = i.item_id AND x.seller_id = u.user_id);

-- 2. Twenty more Suppliers each offer about 15% of the materials: price -15% to +20% of the
--    average, stock 10-199 (about 1 in 10 sold out), minimum order 1-10, lead time 0-7 days.
INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
SELECT i.item_id, s.user_id,
       GREATEST(ROUND(i.avg_price * (0.85 + 0.35 * RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-price')))), 2), 1),
       IF(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-soldout'))) < 0.1, 0,
          10 + FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-stock'))) * 190)),
       1 + FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-min'))) * 10),
       FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-lead'))) * 8),
       CONCAT(dp.phrase, ' ', dd.phrase)
  FROM Items i
  JOIN Categories c ON c.category_id = i.category_id
 CROSS JOIN (SELECT user_id FROM Users
              WHERE account_type = 'Supplier' AND username <> 'superior_foundations_99_28001683'
              ORDER BY user_id LIMIT 20) AS s
  JOIN demo_phrases dp ON dp.category_name = c.category_name
                      AND dp.n = 1 + CRC32(CONCAT(i.item_id, '-', s.user_id, '-text')) % 3
  JOIN demo_delivery dd ON dd.n = 1 + CRC32(CONCAT(s.user_id, '-delivery')) % 4
 WHERE i.is_rentable = 0
   AND RAND(CRC32(CONCAT(i.item_id, '-', s.user_id, '-pick'))) < 0.15
   AND NOT EXISTS (SELECT 1 FROM Listings x WHERE x.item_id = i.item_id AND x.seller_id = s.user_id);

-- 3. Every Rental partner offers about 15% of the rentable items: price -15% to +20%,
--    1-5 units, lead time 0-3 days.
INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
SELECT i.item_id, r.user_id,
       GREATEST(ROUND(i.avg_price * (0.85 + 0.35 * RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-price')))), 2), 1),
       1 + FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-stock'))) * 5),
       1,
       FLOOR(RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-lead'))) * 4),
       CONCAT(dp.phrase, ' ', dd.phrase)
  FROM Items i
  JOIN Categories c ON c.category_id = i.category_id
 CROSS JOIN (SELECT user_id FROM Users WHERE account_type = 'Rental') AS r
  JOIN demo_phrases dp ON dp.category_name = c.category_name
                      AND dp.n = 1 + CRC32(CONCAT(i.item_id, '-', r.user_id, '-text')) % 3
  JOIN demo_delivery dd ON dd.n = 1 + CRC32(CONCAT(r.user_id, '-delivery')) % 4
 WHERE i.is_rentable = 1
   AND RAND(CRC32(CONCAT(i.item_id, '-', r.user_id, '-pick'))) < 0.15
   AND NOT EXISTS (SELECT 1 FROM Listings x WHERE x.item_id = i.item_id AND x.seller_id = r.user_id);
