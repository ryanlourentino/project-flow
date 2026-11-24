-- Rentals: the Contractor chooses the rental period already when adding a machine to the cart
-- (on the product page), so the cart shows the real price. Checkout copies the dates into the order.
--   rent_start / rent_end: both days included; NULL for materials
USE projectflow;

ALTER TABLE CartItems
  ADD COLUMN rent_start DATE NULL AFTER quantity,
  ADD COLUMN rent_end DATE NULL AFTER rent_start,
  ADD CONSTRAINT chk_cart_rent_period CHECK (rent_end IS NULL OR rent_start IS NULL OR rent_end >= rent_start);
