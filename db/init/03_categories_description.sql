-- Optional description for each category.
USE projectflow;

ALTER TABLE Categories ADD COLUMN description VARCHAR(255) NULL AFTER category_name;