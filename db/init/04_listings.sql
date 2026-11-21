-- Listings: one seller's offer for one catalog item (own price and stock).
-- Items = what exists in the catalog; Listings = who sells it, for how much, how many.
USE projectflow;

CREATE TABLE Listings (
    listing_id INT AUTO_INCREMENT PRIMARY KEY,
    item_id    INT           NOT NULL,
    seller_id  INT           NOT NULL,
    price      DECIMAL(12,2) NOT NULL CHECK (price >= 0),
    stock      INT           NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (item_id, seller_id),
    FOREIGN KEY (item_id)   REFERENCES Items(item_id),
    FOREIGN KEY (seller_id) REFERENCES Users(user_id)
);