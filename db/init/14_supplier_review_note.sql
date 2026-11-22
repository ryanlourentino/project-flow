-- The Admin's reason for a decision about a Supplier (e.g. why the Supplier was rejected).
-- Shown to the Admin in the Suppliers table and to the Supplier in My Products.
-- Cleared when the Supplier is approved or set back to pending.
USE projectflow;

ALTER TABLE Suppliers ADD COLUMN review_note VARCHAR(255) NULL AFTER verification_status;
