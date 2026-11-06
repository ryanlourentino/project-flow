-- =====================================================================
-- Project Flow - ETL Script (MySQL)
-- Source files : companies.tsv, materials.tsv, transactions.tsv
-- Target model : ERD v2 (ERDiagramMVP.md)
-- =====================================================================
 
 
-- =====================================================================
-- STEP 1: EXTRACT
-- Load each TSV file into a staging table exactly as it is.
-- =====================================================================
 
-- Purpose: start from an empty database so the script can be re-run safely.
DROP DATABASE IF EXISTS projectflow;
 
-- Purpose: create the database with utf8mb4 so symbols like ㎥ and m² are stored correctly.
CREATE DATABASE projectflow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 
-- Purpose: run all following statements inside the projectflow database.
USE projectflow;
 
-- Purpose: make the connection send and receive text as utf8mb4.
SET NAMES 'utf8mb4';
 
 
-- ---------------------------------------------------------------------
-- 1.1 Companies
-- ---------------------------------------------------------------------
 
-- Purpose: staging table for companies.tsv. Every column is text so no value
-- is rejected or changed while loading (e.g. IDs keep leading zeros like 03028108).
CREATE TABLE temp_companies (
    company_id  VARCHAR(50),
    name        VARCHAR(255),
    description TEXT,
    address     VARCHAR(255),
    phone       VARCHAR(50),
    email       VARCHAR(255),
    comments    TEXT
);
 
-- Purpose: load companies.tsv. Columns are separated by tabs, lines end with
-- Windows line endings (\r\n), and the first line (the header) is skipped.
LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv'
INTO TABLE temp_companies
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES;
 
 
-- ---------------------------------------------------------------------
-- 1.2 Materials
-- ---------------------------------------------------------------------
 
-- Purpose: staging table for materials.tsv. Prices are kept as text for now;
-- they are checked and converted to numbers in the Transform step.
CREATE TABLE temp_materials (
    material_id VARCHAR(50),
    item        TEXT,
    unit        VARCHAR(50),
    price_avg   VARCHAR(50),
    price_stdev VARCHAR(50),
    no_samples  VARCHAR(50)
);
 
-- Purpose: load materials.tsv with the same file format rules.
LOAD DATA INFILE '/var/lib/mysql-files/materials.tsv'
INTO TABLE temp_materials
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES;
 
 
-- ---------------------------------------------------------------------
-- 1.3 Transactions
-- ---------------------------------------------------------------------
 
-- Purpose: staging table for transactions.tsv (all text, checked later).
CREATE TABLE temp_transactions (
    transaction_id   VARCHAR(50),
    company_id       VARCHAR(50),
    material_id      VARCHAR(50),
    quantity         VARCHAR(50),
    price_per_unit   VARCHAR(50),
    discount_rate    VARCHAR(50),
    total_price      VARCHAR(50),
    transaction_date VARCHAR(50),
    notes            TEXT
);
 
-- Purpose: load transactions.tsv with the same file format rules.
LOAD DATA INFILE '/var/lib/mysql-files/transactions.tsv'
INTO TABLE temp_transactions
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES;
 
 
-- ---------------------------------------------------------------------
-- 1.4 Verify the extract
-- ---------------------------------------------------------------------
 
-- Purpose: confirm every row was loaded (expected 500 / 458 / 51947).
SELECT
  (SELECT COUNT(*) FROM temp_companies)    AS companies,
  (SELECT COUNT(*) FROM temp_materials)    AS materials,
  (SELECT COUNT(*) FROM temp_transactions) AS transactions;
 
-- Purpose: confirm no hidden '\r' (CHAR(13)) is left at the end of the last
-- column. Loading with '\n' instead of '\r\n' would leave it in every row.
-- Expected: 0.
SELECT COUNT(*) AS rows_with_hidden_r
FROM temp_transactions
WHERE notes LIKE CONCAT('%', CHAR(13));
 
-- Purpose: confirm special unit symbols (㎥, m²) were stored correctly.
SELECT DISTINCT unit FROM temp_materials;
 
 
-- =====================================================================
-- STEP 2: TRANSFORM
-- =====================================================================
 
-- ---------------------------------------------------------------------
-- 2.1 Missing values
-- A blank cell in a TSV file is loaded as an empty string (''), not as
-- NULL, so IS NULL cannot find it yet. We first count the blanks (Find),
-- turn them into NULL (Fix), and count the NULLs again (Verify).
-- ---------------------------------------------------------------------
 
-- Find
-- Purpose: count blank cells in each used column of transactions.
-- TRIM() removes surrounding spaces; TRIM(x) = '' is 1 for a blank cell
-- and 0 otherwise; SUM() adds the 1s up.
-- Result: 0 in every required column; notes = 20670.
SELECT
  SUM(TRIM(transaction_id)   = '') AS id_blank,
  SUM(TRIM(company_id)       = '') AS company_blank,
  SUM(TRIM(material_id)      = '') AS material_blank,
  SUM(TRIM(quantity)         = '') AS qty_blank,
  SUM(TRIM(price_per_unit)   = '') AS price_blank,
  SUM(TRIM(discount_rate)    = '') AS discount_blank,
  SUM(TRIM(transaction_date) = '') AS date_blank,
  SUM(TRIM(notes)            = '') AS notes_blank
FROM temp_transactions;
 
-- Purpose: count blank cells in each used column of companies.
-- Result: 0 in every column.
SELECT
  SUM(TRIM(company_id)  = '') AS id_blank,
  SUM(TRIM(name)        = '') AS name_blank,
  SUM(TRIM(email)       = '') AS email_blank,
  SUM(TRIM(phone)       = '') AS phone_blank,
  SUM(TRIM(address)     = '') AS address_blank,
  SUM(TRIM(description) = '') AS desc_blank
FROM temp_companies;
 
-- Purpose: count blank cells in each used column of materials.
-- Result: 0 in every column.
SELECT
  SUM(TRIM(material_id) = '') AS id_blank,
  SUM(TRIM(item)        = '') AS item_blank,
  SUM(TRIM(unit)        = '') AS unit_blank,
  SUM(TRIM(price_avg)   = '') AS price_blank
FROM temp_materials;
 
-- Fix
-- Purpose: remove surrounding spaces and turn blank cells into NULL.
-- NULLIF(a, b) returns NULL when a = b, otherwise it returns a.
UPDATE temp_transactions SET
  transaction_id   = NULLIF(TRIM(transaction_id), ''),
  company_id       = NULLIF(TRIM(company_id), ''),
  material_id      = NULLIF(TRIM(material_id), ''),
  quantity         = NULLIF(TRIM(quantity), ''),
  price_per_unit   = NULLIF(TRIM(price_per_unit), ''),
  discount_rate    = NULLIF(TRIM(discount_rate), ''),
  total_price      = NULLIF(TRIM(total_price), ''),
  transaction_date = NULLIF(TRIM(transaction_date), ''),
  notes            = NULLIF(TRIM(notes), '');
 
-- Purpose: same clean-up for companies.
UPDATE temp_companies SET
  company_id  = NULLIF(TRIM(company_id), ''),
  name        = NULLIF(TRIM(name), ''),
  description = NULLIF(TRIM(description), ''),
  address     = NULLIF(TRIM(address), ''),
  phone       = NULLIF(TRIM(phone), ''),
  email       = NULLIF(TRIM(email), ''),
  comments    = NULLIF(TRIM(comments), '');
 
-- Purpose: same clean-up for materials.
UPDATE temp_materials SET
  material_id = NULLIF(TRIM(material_id), ''),
  item        = NULLIF(TRIM(item), ''),
  unit        = NULLIF(TRIM(unit), ''),
  price_avg   = NULLIF(TRIM(price_avg), ''),
  price_stdev = NULLIF(TRIM(price_stdev), ''),
  no_samples  = NULLIF(TRIM(no_samples), '');
 
-- Verify
-- Purpose: prove every blank became NULL. The numbers must match the Find
-- step: 0 in every required column and notes = 20670.
SELECT
  SUM(transaction_id IS NULL)   AS id_null,
  SUM(company_id IS NULL)       AS company_null,
  SUM(material_id IS NULL)      AS mat_null,
  SUM(quantity IS NULL)         AS qty_null,
  SUM(price_per_unit IS NULL)   AS price_null,
  SUM(discount_rate IS NULL)    AS discount_null,
  SUM(transaction_date IS NULL) AS date_null,
  SUM(notes IS NULL)            AS notes_null
FROM temp_transactions;
 
-- Decision: no required value is missing, so no row is removed here.
-- notes is the only column with missing values; it is not used in the
-- final tables, so its NULLs are kept. Rows missing a required value
-- would be rejected in the transaction clean-up step.
 
 
-- ---------------------------------------------------------------------
-- 2.2 Duplicates
-- Two kinds are checked:
--   * true duplicates  : the same ID appears more than once -> delete copies
--   * look-alikes      : same name/value but a different ID -> investigate,
--                        delete only if they are really the same record
-- ---------------------------------------------------------------------
 
-- Find (true duplicates)
-- Purpose: list company IDs that appear more than once.
-- GROUP BY puts rows with the same ID together; HAVING keeps groups with
-- more than one row. Result: empty set (no duplicates).
SELECT company_id, COUNT(*) AS times
FROM temp_companies
GROUP BY company_id
HAVING COUNT(*) > 1;
 
-- Purpose: list material IDs that appear more than once. Result: empty set.
SELECT material_id, COUNT(*) AS times
FROM temp_materials
GROUP BY material_id
HAVING COUNT(*) > 1;
 
-- Purpose: list transaction IDs that appear more than once. Result: empty set.
SELECT transaction_id, COUNT(*) AS times
FROM temp_transactions
GROUP BY transaction_id
HAVING COUNT(*) > 1;
 
-- Find (look-alikes)
-- Purpose: view of company names used by more than one company.
CREATE OR REPLACE VIEW v_dup_company_names AS
SELECT name, COUNT(*) AS times
FROM temp_companies
GROUP BY name
HAVING COUNT(*) > 1;
 
-- Purpose: count repeated names. Result: 67 names, 82 extra rows.
SELECT COUNT(*) AS names_repeated, SUM(times) - COUNT(*) AS extra_rows
FROM v_dup_company_names;
 
-- Purpose: compare companies that share a name.
-- Result: different ID, address, phone and email -> different businesses. Kept.
SELECT c.company_id, c.name, c.address, c.phone, c.email
FROM temp_companies c
JOIN v_dup_company_names d ON d.name = c.name
ORDER BY c.name
LIMIT 6;
 
-- Purpose: view of email addresses used by more than one company.
CREATE OR REPLACE VIEW v_dup_company_emails AS
SELECT email, COUNT(*) AS times
FROM temp_companies
GROUP BY email
HAVING COUNT(*) > 1;
 
-- Purpose: show the most shared emails.
-- Result: 42 generic addresses (info@, sales@, office@) shared by unrelated
-- companies. Kept; email is therefore not UNIQUE in the final Users table.
SELECT * FROM v_dup_company_emails ORDER BY times DESC LIMIT 5;
 
-- Purpose: view of material names used by more than one material ID.
CREATE OR REPLACE VIEW v_dup_material_names AS
SELECT item, COUNT(*) AS times
FROM temp_materials
GROUP BY item
HAVING COUNT(*) > 1;
 
-- Purpose: compare materials that share a name.
-- Result: 2 pairs. The gravel pair has different units (L.㎥ vs ㎥); the
-- crushed-stone pair has different prices and both IDs are used by
-- transactions. Kept.
SELECT m.material_id, m.item, m.unit, m.price_avg
FROM temp_materials m
JOIN v_dup_material_names d ON d.item = m.item
ORDER BY m.item;
 
-- Purpose: view of transactions with the same company, material and date.
CREATE OR REPLACE VIEW v_dup_transactions AS
SELECT company_id, material_id, transaction_date, COUNT(*) AS times
FROM temp_transactions
GROUP BY company_id, material_id, transaction_date
HAVING COUNT(*) > 1;
 
-- Purpose: compare those transactions.
-- Result: 2 pairs with different transaction IDs and quantities ->
-- separate orders on the same day. Kept.
SELECT t.transaction_id, t.company_id, t.material_id, t.quantity, t.transaction_date
FROM temp_transactions t
JOIN v_dup_transactions d USING (company_id, material_id, transaction_date);
 
-- Fix (safety net for true duplicates)
-- Purpose: give every staging row a line number (1, 2, 3 ... in file order)
-- so identical rows can be told apart.
ALTER TABLE temp_companies    ADD COLUMN row_no INT AUTO_INCREMENT PRIMARY KEY FIRST;
ALTER TABLE temp_materials    ADD COLUMN row_no INT AUTO_INCREMENT PRIMARY KEY FIRST;
ALTER TABLE temp_transactions ADD COLUMN row_no INT AUTO_INCREMENT PRIMARY KEY FIRST;
 
-- Purpose: keep the first row of each company_id and delete later copies.
-- ROW_NUMBER() numbers the rows inside each group of the same ID
-- (1st copy = 1, 2nd copy = 2, ...); rows numbered above 1 are deleted.
-- Result: 0 rows affected.
DELETE FROM temp_companies
WHERE row_no IN (
  SELECT row_no FROM (
    SELECT row_no, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY row_no) AS occurrence
    FROM temp_companies
  ) AS numbered
  WHERE occurrence > 1
);
 
-- Purpose: same for materials. Result: 0 rows affected.
DELETE FROM temp_materials
WHERE row_no IN (
  SELECT row_no FROM (
    SELECT row_no, ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY row_no) AS occurrence
    FROM temp_materials
  ) AS numbered
  WHERE occurrence > 1
);
 
-- Purpose: same for transactions. Result: 0 rows affected.
DELETE FROM temp_transactions
WHERE row_no IN (
  SELECT row_no FROM (
    SELECT row_no, ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY row_no) AS occurrence
    FROM temp_transactions
  ) AS numbered
  WHERE occurrence > 1
);
 
-- Verify
-- Purpose: confirm no rows were lost. Expected: 500 / 458 / 51947.
SELECT
  (SELECT COUNT(*) FROM temp_companies)    AS companies,
  (SELECT COUNT(*) FROM temp_materials)    AS materials,
  (SELECT COUNT(*) FROM temp_transactions) AS transactions;
 
 
-- ---------------------------------------------------------------------
-- 2.3 Standardize formats
-- The same kind of value must always be written the same way, so that
-- searching, grouping and displaying work correctly.
-- ---------------------------------------------------------------------
 
-- 2.3a Phone numbers --------------------------------------------------
 
-- Find
-- Purpose: show every phone format. REGEXP_REPLACE turns each digit into 9,
-- so numbers with the same shape fall into one group.
-- Result: 9 formats, e.g. (999) 999-9999, +9-999-999-9999, 999-999-9999,
-- some with an extension x9999.
SELECT REGEXP_REPLACE(phone, '[0-9]', '9') AS phone_pattern,
       COUNT(*)   AS companies,
       MIN(phone) AS example
FROM temp_companies
GROUP BY phone_pattern
ORDER BY companies DESC;
 
-- Fix
-- Purpose: helper columns - the original phone (for comparison), its digits
-- only, and its extension.
ALTER TABLE temp_companies
  ADD COLUMN phone_raw    VARCHAR(50),
  ADD COLUMN phone_digits VARCHAR(20),
  ADD COLUMN phone_ext    VARCHAR(10);
 
-- Purpose: split each phone into digits and extension.
-- REGEXP_SUBSTR copies the extension (x + digits at the end);
-- the inner REGEXP_REPLACE removes the extension, the outer one removes
-- every character that is not a digit.
UPDATE temp_companies SET
  phone_raw    = phone,
  phone_ext    = REGEXP_SUBSTR(phone, 'x[0-9]+$'),
  phone_digits = REGEXP_REPLACE(REGEXP_REPLACE(phone, ' ?x[0-9]+$', ''), '[^0-9]', '');
 
-- Purpose: check how many digits each number has.
-- Result: 335 with 10 digits, 165 with 11 (they start with country code 1).
SELECT CHAR_LENGTH(phone_digits) AS digit_count, COUNT(*) AS companies
FROM temp_companies
GROUP BY digit_count;
 
-- Purpose: remove the US country code "1" from 11-digit numbers.
UPDATE temp_companies
SET phone_digits = SUBSTRING(phone_digits, 2)
WHERE CHAR_LENGTH(phone_digits) = 11 AND phone_digits LIKE '1%';
 
-- Purpose: confirm every number now has exactly 10 digits. Result: 0.
SELECT COUNT(*) AS not_10_digits
FROM temp_companies
WHERE CHAR_LENGTH(phone_digits) <> 10;
 
-- Purpose: rebuild every phone as 123-456-7890, plus " x1234" if it has an
-- extension. IFNULL keeps the phone from becoming NULL when there is no
-- extension. Result: 500 matched, 341 changed (159 were already correct).
UPDATE temp_companies SET phone = CONCAT(
  SUBSTRING(phone_digits, 1, 3), '-',
  SUBSTRING(phone_digits, 4, 3), '-',
  SUBSTRING(phone_digits, 7, 4),
  IFNULL(CONCAT(' ', phone_ext), '')
);
 
-- Verify
-- Purpose: confirm only the standard format remains.
-- Result: 3 patterns - 999-999-9999 (439), 999-999-9999 x9999 (54),
-- 999-999-9999 x999 (7).
SELECT REGEXP_REPLACE(phone, '[0-9]', '9') AS phone_pattern,
       COUNT(*)   AS companies,
       MIN(phone) AS example
FROM temp_companies
GROUP BY phone_pattern
ORDER BY companies DESC;
 
-- Purpose: compare original and standardized phones,
-- e.g. (341) 269-6159 x3074 -> 341-269-6159 x3074.
SELECT phone_raw, phone FROM temp_companies LIMIT 5;
 
 
-- 2.3b Units ----------------------------------------------------------
 
-- Find
-- Purpose: list units written in more than one way (upper/lower case).
-- The database collation is case-insensitive, so COLLATE utf8mb4_bin is
-- used to compare exact characters.
-- Result: piece -> "Piece,piece"; one test -> "One test,one test".
SELECT LOWER(unit) AS unit_lower,
       COUNT(DISTINCT unit COLLATE utf8mb4_bin) AS spellings,
       GROUP_CONCAT(DISTINCT unit COLLATE utf8mb4_bin) AS written_as
FROM temp_materials
GROUP BY unit_lower
HAVING spellings > 1;
 
-- Purpose: count each spelling. Result: Piece 89, piece 8, One test 13, one test 4.
SELECT unit COLLATE utf8mb4_bin AS unit_exact, COUNT(*) AS materials
FROM temp_materials
WHERE LOWER(unit) IN ('piece', 'one test')
GROUP BY unit_exact;
 
-- Fix
-- Purpose: use the majority (capitalized) spelling. Result: 8 rows changed.
UPDATE temp_materials SET unit = 'Piece'
WHERE unit COLLATE utf8mb4_bin = 'piece';
 
-- Purpose: same for "one test". Result: 4 rows changed.
UPDATE temp_materials SET unit = 'One test'
WHERE unit COLLATE utf8mb4_bin = 'one test';
 
-- Verify
-- Purpose: confirm no unit has more than one spelling. Result: empty set.
SELECT LOWER(unit) AS unit_lower,
       COUNT(DISTINCT unit COLLATE utf8mb4_bin) AS spellings,
       GROUP_CONCAT(DISTINCT unit COLLATE utf8mb4_bin) AS written_as
FROM temp_materials
GROUP BY unit_lower
HAVING spellings > 1;
 
-- Note: L.㎥, B.㎥ and C.㎥ are different earthwork volume measures, not
-- typos of ㎥, so they are kept. "root" (a mistranslation of 根, used for
-- bars) only appears on rebar test items, which are out of scope.
 
 
-- 2.3c Columns that should already be consistent -----------------------
-- Pattern symbols: ^ start, $ end, [0-9] a digit, {8} exactly 8 times,
-- + one or more, [^@ ] any character except @ and space.
 
-- Purpose: check company IDs are 8 digits and emails have a valid shape.
-- Result: 0 / 0.
SELECT SUM(company_id NOT REGEXP '^[0-9]{8}$')         AS bad_id,
       SUM(email NOT REGEXP '^[^@ ]+@[^@ ]+[.][a-z]+$') AS bad_email
FROM temp_companies;
 
-- Purpose: check material IDs are 8 digits and prices are whole numbers.
-- Result: 0 / 0.
SELECT SUM(material_id NOT REGEXP '^[0-9]{8}$') AS bad_id,
       SUM(price_avg   NOT REGEXP '^[0-9]+$')   AS bad_price
FROM temp_materials;
 
-- Purpose: check transaction IDs, numbers and dates (YYYY-MM-DD).
-- Result: 0 in every column.
SELECT SUM(transaction_id   NOT REGEXP '^[0-9]{8}$')                   AS bad_id,
       SUM(company_id       NOT REGEXP '^[0-9]{8}$')                   AS bad_company_id,
       SUM(material_id      NOT REGEXP '^[0-9]{8}$')                   AS bad_material_id,
       SUM(quantity         NOT REGEXP '^[0-9]+$')                     AS bad_quantity,
       SUM(price_per_unit   NOT REGEXP '^[0-9]+$')                     AS bad_price,
       SUM(discount_rate    NOT REGEXP '^[0-9]+$')                     AS bad_discount,
       SUM(transaction_date NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') AS bad_date
FROM temp_transactions;
 
 
-- 2.3d Item names starting with a lowercase letter -----------------------
 
-- Find
-- Purpose: list item names that start with a lowercase letter
-- (e.g. "product. plywood. Thick 18mm"). Result: 8 rows.
SELECT material_id, item
FROM temp_materials
WHERE item COLLATE utf8mb4_bin REGEXP '^[a-z]';
 
-- Fix
-- Purpose: capitalize only the first letter; the rest of the name is kept.
-- Result: 8 rows changed.
UPDATE temp_materials
SET item = CONCAT(UPPER(LEFT(item, 1)), SUBSTRING(item, 2))
WHERE item COLLATE utf8mb4_bin REGEXP '^[a-z]';
 
-- Verify
-- Purpose: confirm no item name starts with a lowercase letter. Result: empty set.
SELECT material_id, item
FROM temp_materials
WHERE item COLLATE utf8mb4_bin REGEXP '^[a-z]';