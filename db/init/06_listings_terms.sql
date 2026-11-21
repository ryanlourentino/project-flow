-- Order terms for each listing.
--   min_order: smallest quantity a buyer may order (at least 1)
--   lead_days: days until delivery (0 = same day)
USE projectflow;

ALTER TABLE Listings
  ADD COLUMN min_order INT NOT NULL DEFAULT 1 AFTER stock,
  ADD COLUMN lead_days INT NOT NULL DEFAULT 0 AFTER min_order,
  ADD CONSTRAINT chk_listings_min_order CHECK (min_order >= 1),
  ADD CONSTRAINT chk_listings_lead_days CHECK (lead_days >= 0);