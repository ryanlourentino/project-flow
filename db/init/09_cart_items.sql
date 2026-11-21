-- Shopping cart: which listings a buyer (Contractor) wants to order, and how many.
-- One row per buyer and listing; adding the same offer again raises the quantity.
-- ON DELETE CASCADE: when a seller deletes a listing, it simply disappears from carts.
USE projectflow;

CREATE TABLE CartItems (
    cart_item_id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_id     INT      NOT NULL,
    listing_id   INT      NOT NULL,
    quantity     INT      NOT NULL CHECK (quantity >= 1),
    added_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (buyer_id, listing_id),
    FOREIGN KEY (buyer_id)   REFERENCES Users(user_id),
    FOREIGN KEY (listing_id) REFERENCES Listings(listing_id) ON DELETE CASCADE
);
