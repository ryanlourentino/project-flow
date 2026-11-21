-- Seller's own description of a listing (brand, grade, delivery area, minimum order...).
USE projectflow;

ALTER TABLE Listings ADD COLUMN description VARCHAR(500) NULL AFTER stock;