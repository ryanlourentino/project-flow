-- Admin tools (polish part 5): what buyers may see, plus demo data for the Admin pages.
USE projectflow;
SET NAMES 'utf8mb4';   -- this file is UTF-8

-- 1. MarketListings: the listings buyers may see.
-- A VIEW is a saved SELECT that can be used like a table. When the Admin rejects a Supplier,
-- that Supplier's listings drop out of this view, so they disappear from every buyer page
-- (categories, offers, seller page, cart) without deleting anything. Undoing the rejection
-- brings them back. The rule lives in one place instead of in every query.
-- SQL SECURITY INVOKER: the view runs with the rights of the user who reads it (the app's user).
CREATE OR REPLACE SQL SECURITY INVOKER VIEW MarketListings AS
SELECT l.*
  FROM Listings l
 WHERE NOT EXISTS (SELECT 1 FROM Suppliers s
                    WHERE s.user_id = l.seller_id AND s.verification_status = 'Rejected');

-- 2. Demo: 6 Suppliers without a certificate send one in, so the Admin has certificates
-- "waiting for review" (Pending + a certificate). Same CRC32 trick as 07 and 11.
-- Only once: if some Supplier is already waiting, nothing changes (safe to run again).
SET @waiting = (SELECT COUNT(*) FROM Suppliers
                 WHERE verification_status = 'Pending' AND iso_certification IS NOT NULL);
UPDATE Suppliers s
   SET s.iso_certification = CONCAT(
         ELT(1 + CRC32(CONCAT(s.user_id, '-standard')) % 3, 'ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'),
         ' - No. PF-', LPAD(CRC32(CONCAT(s.user_id, '-number')) % 100000, 5, '0'),
         ' (demo)')
 WHERE @waiting = 0
   AND s.verification_status = 'Pending' AND s.iso_certification IS NULL
 ORDER BY CRC32(CONCAT(s.user_id, '-sends-certificate'))
 LIMIT 6;

-- 3. Demo: three products that sellers added themselves (is_reviewed = FALSE, the "New" badge),
-- each with its listing, so the Admin's "New products" page has something to review:
--   a duplicate of an existing cement product (to try Merge), a real new material (Approve),
--   and a rental machine with a sloppy name (Edit, then Approve).
-- WHERE NOT EXISTS: only added once (safe to run again).
INSERT INTO Items (category_id, listed_by, item_name, unit, avg_price, is_rentable, is_reviewed)
SELECT c.category_id, u.user_id, p.item_name, p.unit, NULL, p.is_rentable, FALSE
  FROM (SELECT 'Concrete & Cement' AS category_name, 'beacon_insulation_44398217' AS username,
               'portland cement type 1, 50kg bag' AS item_name, 'Bag' AS unit, 0 AS is_rentable
        UNION ALL
        SELECT 'Landscaping', 'superior_foundations_99_28001683',
               'Geotextile fabric - Non-woven - 200 g/m²', 'm²', 0
        UNION ALL
        SELECT 'Machines', 'atlas_foundations_51794209',
               'scissor lift 8m electric (with charger)', 'Day', 1) AS p
  JOIN Categories c ON c.category_name = p.category_name
  JOIN Users u      ON u.username = p.username
 WHERE NOT EXISTS (SELECT 1 FROM Items i WHERE i.item_name = p.item_name);

INSERT INTO Listings (item_id, seller_id, price, stock, min_order, lead_days, description)
SELECT i.item_id, i.listed_by, p.price, p.stock, p.min_order, p.lead_days, p.description
  FROM (SELECT 'portland cement type 1, 50kg bag' AS item_name, 7.80 AS price, 400 AS stock,
               20 AS min_order, 2 AS lead_days, 'Fresh stock, pallet of 40 bags. (demo)' AS description
        UNION ALL
        SELECT 'Geotextile fabric - Non-woven - 200 g/m²', 1.35, 5000, 100, 3,
               'Rolls of 4 m x 100 m, for drainage and soil separation. (demo)'
        UNION ALL
        SELECT 'scissor lift 8m electric (with charger)', 95.00, 3, 1, 1,
               'Indoor and outdoor use, delivered on a trailer. (demo)') AS p
  JOIN Items i ON i.item_name = p.item_name AND i.is_reviewed = FALSE
 WHERE NOT EXISTS (SELECT 1 FROM Listings l WHERE l.item_id = i.item_id AND l.seller_id = i.listed_by);
