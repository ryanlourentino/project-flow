-- Sellers can add a product that is not in the catalog yet (the Admin reviews it afterwards).
--   source_material_id: NULL for products added in the app (they do not come from materials.tsv)
--   avg_price:          NULL until a market average is known (the ETL computed it from transactions)
--   listed_by:          (existing column) the seller who added the product; NULL = from the source data
--   is_reviewed:        FALSE while the Admin has not checked a seller-added product ("New" badge)
USE projectflow;

ALTER TABLE Items
  MODIFY source_material_id CHAR(8) NULL,
  MODIFY avg_price DECIMAL(12,2) NULL,
  ADD COLUMN is_reviewed BOOLEAN NOT NULL DEFAULT TRUE AFTER is_rentable;
