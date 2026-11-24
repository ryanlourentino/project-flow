-- Ordering (Assignment #5): a Contractor turns the cart into purchase orders, one order per seller.
-- The tables PurchaseOrders and OrderItems already exist: the ETL filled them with the historical orders
-- (status 'Delivered', no seller). Here they get what orders placed in the app need.
USE projectflow;

-- ---------- PurchaseOrders ----------
--   source_transaction_id: NULL for orders placed in the app (only the historical orders come from the source data)
--   seller_id:        the Supplier or Rental partner who receives the order (NULL for the historical orders)
--   order_status:     the order's progress. Materials: Pending -> Accepted -> Dispatched -> Delivered.
--                     Rentals:   Pending -> Accepted -> On site -> Returned.
--                     Declined (the seller declined every line) and Cancelled (the Contractor cancelled) end an order.
--                     'Processed' stays for compatibility with the ETL's original list.
--   delivery_address: copied from the project when ordering (it must not change if the project is edited later)
--   note:             the Contractor's message to the seller (optional)
--   planned_date:     the delivery date the seller plans when accepting
--   ordered_at:       date and time of ordering (order_date only keeps the day)
ALTER TABLE PurchaseOrders
  MODIFY source_transaction_id CHAR(8) NULL,
  MODIFY order_status ENUM('Pending', 'Processed', 'Accepted', 'Dispatched', 'Delivered', 'On site', 'Returned',
                           'Declined', 'Cancelled') NOT NULL DEFAULT 'Pending',
  ADD COLUMN seller_id INT NULL AFTER contractor_id,
  ADD COLUMN delivery_address VARCHAR(255) NULL AFTER proj_id,
  ADD COLUMN note VARCHAR(500) NULL AFTER total_value,
  ADD COLUMN planned_date DATE NULL AFTER note,
  ADD COLUMN ordered_at DATETIME NULL AFTER order_date,
  ADD CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES Users (user_id);

-- ---------- OrderItems ----------
--   listing_id:     the offer the line came from (SET NULL if the listing is deleted later: the order line stays,
--                   with its own copy of the price in unit_price)
--   line_status:    each line is accepted or declined by the seller on its own (partial accept);
--                   NULL for the historical lines
--   decline_reason: why the seller declined this line
--   rent_start / rent_end: the rental period (rentals only; both days included)
ALTER TABLE OrderItems
  ADD COLUMN listing_id INT NULL AFTER item_id,
  ADD COLUMN line_status ENUM('Pending', 'Accepted', 'Declined') NULL AFTER discount_rate,
  ADD COLUMN decline_reason VARCHAR(255) NULL AFTER line_status,
  ADD COLUMN rent_start DATE NULL AFTER decline_reason,
  ADD COLUMN rent_end DATE NULL AFTER rent_start,
  ADD CONSTRAINT fk_order_items_listing FOREIGN KEY (listing_id) REFERENCES Listings (listing_id) ON DELETE SET NULL,
  ADD CONSTRAINT chk_rent_period CHECK (rent_end IS NULL OR rent_start IS NULL OR rent_end >= rent_start);

-- Order numbers for new orders continue right after the historical ones. (Loading the history with one big
-- INSERT ... SELECT made MySQL reserve numbers in blocks, so the next number would jump to 65536.)
-- AUTO_INCREMENT = 1 means "the lowest number that is still free after the existing rows".
ALTER TABLE PurchaseOrders AUTO_INCREMENT = 1;
