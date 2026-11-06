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
-- row_no is filled automatically (1, 2, 3 ...) in the order the lines are read
-- from the file, so every row can be told apart and traced to its file line.
CREATE TABLE temp_companies (
    row_no      INT AUTO_INCREMENT PRIMARY KEY,
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
-- The column list tells MySQL which columns the file fills; row_no is left
-- out so MySQL numbers it automatically.
LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv'
INTO TABLE temp_companies
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES
(company_id, name, description, address, phone, email, comments);
 
 
-- ---------------------------------------------------------------------
-- 1.2 Materials
-- ---------------------------------------------------------------------
 
-- Purpose: staging table for materials.tsv. Prices are kept as text for now;
-- they are checked and converted to numbers in the Transform step.
CREATE TABLE temp_materials (
    row_no      INT AUTO_INCREMENT PRIMARY KEY,
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
IGNORE 1 LINES
(material_id, item, unit, price_avg, price_stdev, no_samples);
 
 
-- ---------------------------------------------------------------------
-- 1.3 Transactions
-- ---------------------------------------------------------------------
 
-- Purpose: staging table for transactions.tsv (all text, checked later).
CREATE TABLE temp_transactions (
    row_no           INT AUTO_INCREMENT PRIMARY KEY,
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
IGNORE 1 LINES
(transaction_id, company_id, material_id, quantity, price_per_unit,
 discount_rate, total_price, transaction_date, notes);
 
 
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
-- Every staging row already has a line number (row_no, filled while loading
-- in Step 1), so identical rows can be told apart.
 
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
 
 
-- ---------------------------------------------------------------------
-- 2.4 Clean the transactions
-- Bad rows are not deleted. Each one is labelled in reject_reason, so the
-- report can show what was removed and why. Every rule only labels rows
-- that have no label yet (reject_reason IS NULL), so a row keeps its FIRST
-- problem and is counted once. Only unlabelled rows are loaded later.
-- ---------------------------------------------------------------------
 
-- Purpose: column that holds the reason a transaction is rejected.
ALTER TABLE temp_transactions ADD COLUMN reject_reason VARCHAR(50) NULL;
 
 
-- 2.4a Dates that are too old ----------------------------------------
 
-- Find
-- Purpose: count transactions per year.
-- Result: 1950-1980 have ~150-200 rows per year, 1981-2017 have none,
-- 2018-2025 have ~6,000 per year. The 1950-1980 rows are impossible.
SELECT LEFT(transaction_date, 4) AS year, COUNT(*) AS transactions
FROM temp_transactions
GROUP BY year
ORDER BY year;
 
-- Purpose: check for dates in the future (also impossible). Result: 0.
SELECT COUNT(*) AS future_dates
FROM temp_transactions
WHERE transaction_date > CURDATE();
 
-- Purpose: prove the cutoff 2000-01-01 is safe - it lies inside the empty
-- gap. Result: last old date in 1980, first real date 2018-01-01.
-- Any cutoff between 1981 and 2017 rejects exactly the same rows.
SELECT MAX(transaction_date) AS last_old_date
FROM temp_transactions WHERE transaction_date < '2000-01-01';
 
SELECT MIN(transaction_date) AS first_real_date
FROM temp_transactions WHERE transaction_date >= '2000-01-01';
 
-- Fix
-- Purpose: label transactions dated before 2000. STR_TO_DATE turns the text
-- into a real date so it is compared as a date. Result: 5198 rows.
UPDATE temp_transactions
SET reject_reason = 'date before 2000'
WHERE reject_reason IS NULL
  AND STR_TO_DATE(transaction_date, '%Y-%m-%d') < '2000-01-01';
 
 
-- 2.4b Unknown company IDs (orphans) ----------------------------------
 
-- Purpose: indexes so each transaction can find its company/material
-- quickly instead of scanning the whole table every time.
ALTER TABLE temp_companies ADD INDEX idx_company_id (company_id);
ALTER TABLE temp_materials ADD INDEX idx_material_id (material_id);
 
-- Find
-- Purpose: view of transactions whose company_id does not exist.
-- LEFT JOIN keeps every transaction; when no company matches, the company
-- columns are NULL, so "c.company_id IS NULL" selects the orphans.
CREATE OR REPLACE VIEW v_unknown_company AS
SELECT t.row_no, t.transaction_id, t.company_id
FROM temp_transactions t
LEFT JOIN temp_companies c ON c.company_id = t.company_id
WHERE c.company_id IS NULL;
 
-- Purpose: count orphans. Result: 2615 rows, 2615 different IDs - every
-- bad ID is used once, so they are invented, not typos, and cannot be repaired.
SELECT COUNT(*) AS unknown_company_rows,
       COUNT(DISTINCT company_id) AS unknown_ids
FROM v_unknown_company;
 
-- Purpose: show a few examples.
SELECT * FROM v_unknown_company LIMIT 3;
 
-- Fix
-- Purpose: label the orphans. Result: 2393 rows (the other 222 already
-- have the label "date before 2000").
UPDATE temp_transactions t
LEFT JOIN temp_companies c ON c.company_id = t.company_id
SET t.reject_reason = 'unknown company_id'
WHERE t.reject_reason IS NULL
  AND c.company_id IS NULL;
 
 
-- 2.4c Unknown material IDs (orphans) ---------------------------------
 
-- Find
-- Purpose: view of transactions whose material_id does not exist.
CREATE OR REPLACE VIEW v_unknown_material AS
SELECT t.row_no, t.transaction_id, t.material_id
FROM temp_transactions t
LEFT JOIN temp_materials m ON m.material_id = t.material_id
WHERE m.material_id IS NULL;
 
-- Purpose: count orphans. Result: 2643 rows, 2643 different IDs.
SELECT COUNT(*) AS unknown_material_rows,
       COUNT(DISTINCT material_id) AS unknown_ids
FROM v_unknown_material;
 
-- Purpose: show a few examples.
SELECT * FROM v_unknown_material LIMIT 3;
 
-- Fix
-- Purpose: label the orphans. Result: 2226 rows (the rest already have a label).
UPDATE temp_transactions t
LEFT JOIN temp_materials m ON m.material_id = t.material_id
SET t.reject_reason = 'unknown material_id'
WHERE t.reject_reason IS NULL
  AND m.material_id IS NULL;
 
 
-- 2.4d Rejection report -------------------------------------------------
 
-- Purpose: summary of valid and rejected transactions.
-- Result: valid 42130, date before 2000 5198, unknown company_id 2393,
-- unknown material_id 2226 (total 51947).
SELECT IFNULL(reject_reason, '(valid)') AS status, COUNT(*) AS transactions
FROM temp_transactions
GROUP BY status
ORDER BY transactions DESC;
 
-- Purpose: count every problem without the "first reason only" rule.
-- Result: 5198 / 2615 / 2643; 627 rows have 2 or more problems, which is
-- why the labelled counts above are smaller.
SELECT
  SUM(t.transaction_date < '2000-01-01')                       AS old_date,
  SUM(c.company_id IS NULL)                                    AS unknown_company,
  SUM(m.material_id IS NULL)                                   AS unknown_material,
  SUM((t.transaction_date < '2000-01-01')
      + (c.company_id IS NULL) + (m.material_id IS NULL) >= 2) AS rows_with_2plus_problems
FROM temp_transactions t
LEFT JOIN temp_companies c ON c.company_id  = t.company_id
LEFT JOIN temp_materials m ON m.material_id = t.material_id;
 
 
-- 2.4e Wrong totals -------------------------------------------------------
-- Correct total = quantity x price_per_unit x (1 - discount_rate / 100)
 
-- Find
-- Purpose: view comparing the file's total with the correct total.
-- (Text columns are converted to numbers automatically; 2.3c proved they
-- are all whole numbers.)
CREATE OR REPLACE VIEW v_total_check AS
SELECT row_no, transaction_id, quantity, price_per_unit, discount_rate, total_price,
       ROUND(quantity * price_per_unit * (1 - discount_rate / 100), 2) AS expected_total,
       total_price - ROUND(quantity * price_per_unit * (1 - discount_rate / 100), 2) AS difference
FROM temp_transactions;
 
-- Purpose: sort every transaction by how its total compares.
-- Result: exact 31450, rounding (<= 10) 17962, total = unit price 2535,
-- other 0.
SELECT CASE
         WHEN ABS(difference) < 0.01       THEN '1. exact'
         WHEN ABS(difference) <= 10        THEN '2. rounding (<= 10)'
         WHEN total_price = price_per_unit THEN '3. total = unit price'
         ELSE '4. other'
       END AS check_result,
       COUNT(*) AS transactions
FROM v_total_check
GROUP BY check_result
ORDER BY check_result;
 
-- Purpose: show the planted error - the quantity was not multiplied in
-- (e.g. 149 x 25000 should be 3725000, the file says 25000).
SELECT * FROM v_total_check
WHERE total_price = price_per_unit AND quantity <> 1
LIMIT 3;
 
-- Evidence that no third factor (tax, fee) changes the totals:
-- Purpose: every total in the file ends in 0 -> totals are rounded to the
-- nearest 10. Result: 51947 / 51947.
SELECT SUM(MOD(total_price, 10) = 0) AS ends_in_0, COUNT(*) AS all_rows
FROM temp_transactions;
 
-- Purpose: the small differences are symmetric (-5..+5, each +/- pair
-- about equally common). A tax or fee would only make totals higher.
SELECT difference, COUNT(*) AS transactions
FROM v_total_check
WHERE ABS(difference) <= 10
GROUP BY difference
ORDER BY difference;
 
-- Purpose: no percentage is added on average. Result: 1 (a 5% tax would give 1.05).
SELECT ROUND(AVG(total_price / expected_total), 5) AS avg_ratio
FROM v_total_check
WHERE NOT (total_price = price_per_unit AND quantity <> 1);
 
-- Note: the 2535 broken totals are spread evenly (~5%) over every year,
-- quantity range and discount level, so they are random planted errors,
-- not a business rule.
 
-- Fix
-- Purpose: column for the exact total. DECIMAL stores money exactly.
ALTER TABLE temp_transactions ADD COLUMN total_value DECIMAL(14,2);
 
-- Purpose: recalculate every total with one rule. This repairs the 2535
-- broken totals and replaces the rounded ones with exact values.
-- Result: 51947 rows changed.
UPDATE temp_transactions
SET total_value = ROUND(quantity * price_per_unit * (1 - discount_rate / 100), 2);
 
-- Verify
-- Purpose: compare old and new totals of broken rows
-- (e.g. 418 x 100 x 0.84: old 100 -> new 35112.00).
SELECT transaction_id, quantity, price_per_unit, discount_rate,
       total_price AS old_total, total_value AS new_total
FROM temp_transactions
WHERE total_price = price_per_unit AND quantity <> 1
LIMIT 3;
 
-- Purpose: confirm every total now matches the formula. Result: 0.
SELECT COUNT(*) AS wrong_after_fix
FROM temp_transactions
WHERE total_value IS NULL
   OR total_value <> ROUND(quantity * price_per_unit * (1 - discount_rate / 100), 2);
 
 
-- ---------------------------------------------------------------------
-- 2.5 Classify the items
-- materials.tsv mixes products, machines, labour, testing and construction
-- work. Project Flow only sells materials (suppliers) and rents equipment
-- (rental companies). Items are classified by keywords in their names.
-- Rules run in order; each rule only labels items that have no label yet,
-- so a specific rule placed early wins over a general rule placed later.
-- REGEXP 'a|b' means "contains a OR b" (case-insensitive collation).
-- ---------------------------------------------------------------------
 
-- 2.5a Label columns ---------------------------------------------------
 
-- Purpose: item_group = kind of item, category_name = search category,
-- is_rentable = offered for rent (TRUE) or for sale (FALSE, the default).
ALTER TABLE temp_materials
  ADD COLUMN item_group    VARCHAR(30) NULL,
  ADD COLUMN category_name VARCHAR(50) NULL,
  ADD COLUMN is_rentable   BOOLEAN NOT NULL DEFAULT FALSE;
 
 
-- 2.5b Group every item -------------------------------------------------
 
-- Purpose: Rule 1 - names with no description (exactly "Products." or "Rebar.").
-- A customer cannot order an unidentified item. Result: 2 rows.
UPDATE temp_materials SET item_group = 'Unidentified'
WHERE item_group IS NULL
  AND item REGEXP '^(Products?|Rebar)[.]?$';
 
-- Purpose: Rule 2 - construction work hidden among products (the price
-- includes labour or installation, so it is done by a subcontractor).
-- Must run before Rule 4. Result: 5 rows.
UPDATE temp_materials SET item_group = 'Construction work'
WHERE item_group IS NULL
  AND item REGEXP 'continuous work|installation fee|installation including|daytime construction';
 
-- Purpose: Rule 3 - laboratory and inspection services. Result: 24 rows.
UPDATE temp_materials SET item_group = 'Testing'
WHERE item_group IS NULL
  AND item LIKE 'Quality management%';
 
-- Purpose: Rule 4 - products (names starting "Product." / "Products." /
-- "Product:"). Result: 310 rows.
UPDATE temp_materials SET item_group = 'Material'
WHERE item_group IS NULL
  AND item REGEXP '^(Product|Products)[.:]';
 
-- Purpose: Rule 5 - machines, rented with an operator. Result: 26 rows.
UPDATE temp_materials SET item_group = 'Machine'
WHERE item_group IS NULL
  AND item REGEXP 'operator|crusher|wheeled|trailer|crawler';
 
-- Purpose: Rule 6 - workers hired per day or hour. ^engineer$ matches only
-- the exact name "Engineer", not "engineering". Result: 35 rows.
UPDATE temp_materials SET item_group = 'Labour'
WHERE item_group IS NULL
  AND item REGEXP 'technician|workers|^engineer$|plasterer';
 
-- Purpose: Rule 7 - raw materials without "Product" in the name
-- (e.g. "Structural concrete"), excluding services such as demolition or
-- paving that mention a material. Result: 24 rows.
UPDATE temp_materials SET item_group = 'Material'
WHERE item_group IS NULL
  AND item REGEXP 'concrete|mortar|backfill|rebar|clay|formwork'
  AND item NOT REGEXP 'remov|demolition|excavation|paving|pavement|transport|wages|processing|embedded';
 
-- Purpose: Rule 8 - everything left is construction work (excavation,
-- demolition, transport, scaffolding erection ...). Result: 32 rows.
UPDATE temp_materials SET item_group = 'Construction work'
WHERE item_group IS NULL;
 
-- Verify
-- Purpose: count items per group. Result: Material 334, Construction work 37,
-- Labour 35, Machine 26, Testing 24, Unidentified 2 (total 458).
SELECT item_group, COUNT(*) AS items
FROM temp_materials
GROUP BY item_group
ORDER BY items DESC;
 
-- Purpose: review construction work by eye (includes both scaffolding items).
SELECT item, unit FROM temp_materials WHERE item_group = 'Construction work';
 
 
-- 2.5c Categories ----------------------------------------------------------
 
-- Purpose: all machines share one category.
UPDATE temp_materials SET category_name = 'Machines'
WHERE item_group = 'Machine';
 
-- Purpose: pipes first, so "Reinforced concrete pipe" is a pipe, not concrete.
-- "Underground distribution pipelines. Backfill. Sand" is sand, so it is excluded.
UPDATE temp_materials SET category_name = 'Pipes & Drainage'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'pipe|drain|culvert|trench cover|sump|grating|water intake|waterstop|air duct|anti-vibration'
  AND item NOT LIKE 'Underground distribution%';
 
-- Purpose: protective, warning and temporary site equipment.
UPDATE temp_materials SET category_name = 'Safety & Site Equipment'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'occupational|fire|extinguish|traffic cone|construction sign|warning|guardrail|chevaux|notice board|divider|construction fence|access control|monitoring|temporary facilities|temporary construction facilities|temporary conducting|safety net';
 
-- Purpose: planting and slope-protection materials.
UPDATE temp_materials SET category_name = 'Landscaping'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'grass|fertilizer|planting|seed|straw|slope protection|earth bags|snake cage|seaweed';
 
-- Purpose: formwork, plywood and timber.
UPDATE temp_materials SET category_name = 'Formwork & Timber'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'formwork|plywood|timber|clamps';
 
-- Purpose: aggregates, stone, sand, soil and geotextiles.
-- [.] means a real dot.
UPDATE temp_materials SET category_name = 'Aggregates & Soil'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'aggregate|granule|sand|gravel|pebble|backfill|soil|clay|geotextile|crushed stone|stone dump|stone[.] block|small stones|washed stone|stone powder';
 
-- Purpose: asphalt, paving and road marking. "floor tile" (not "tile")
-- keeps geotextiles and wall tiles out.
UPDATE temp_materials SET category_name = 'Asphalt & Paving'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'asphalt|paving|floor tile|brick|marking|glass beads|polyester|edge stone|toner|sidewalk|road|surfacing';
 
-- Purpose: concrete, cement, mortar and admixtures.
UPDATE temp_materials SET category_name = 'Concrete & Cement'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'concrete|cement|mortar|shrinkage|admixture|early strength';
 
-- Purpose: steel, rebar, wire, fasteners and other metals.
UPDATE temp_materials SET category_name = 'Steel & Metal'
WHERE item_group = 'Material' AND category_name IS NULL
  AND item REGEXP 'steel|metal|iron|rebar|wire|bolt|nut|screw|beam|aluminum|tendon|anchor|sheet pile';
 
-- Purpose: every remaining material gets "Others", so none is left without
-- a category.
UPDATE temp_materials SET category_name = 'Others'
WHERE item_group = 'Material' AND category_name IS NULL;
 
-- Verify
-- Purpose: count items per category. Result: Pipes & Drainage 68,
-- Safety & Site Equipment 62, Concrete & Cement 46, Steel & Metal 39,
-- Aggregates & Soil 37, Asphalt & Paving 31, Machines 26, Others 20,
-- Landscaping 18, Formwork & Timber 13 (total 360).
SELECT category_name, COUNT(*) AS items
FROM temp_materials
WHERE category_name IS NOT NULL
GROUP BY category_name
ORDER BY items DESC;
 
-- Purpose: confirm every in-scope item has a category. Result: 0.
SELECT COUNT(*) AS in_scope_without_category
FROM temp_materials
WHERE item_group IN ('Material', 'Machine') AND category_name IS NULL;
 
 
-- 2.5d Rentable items --------------------------------------------------------
 
-- Purpose: machines are always rented (priced per Hour, Day or Trip).
UPDATE temp_materials SET is_rentable = TRUE
WHERE item_group = 'Machine';
 
-- Purpose: site equipment whose name shows it is rented or temporary.
-- The space in ' movable' avoids matching "Non-removable" formwork, which
-- stays in the building and is bought. Items without such evidence
-- (e.g. traffic cones) stay "for sale"; construction work is never marked.
UPDATE temp_materials SET is_rentable = TRUE
WHERE item_group = 'Material'
  AND item REGEXP 'rental|depreciation|temporary| movable|mobile';
 
-- Verify
-- Purpose: list rentable materials. Result: 10 (rental signs, warning
-- lights, mobile notice board, movable barriers, temporary toilets,
-- temporary lighting, conductor baton, 2 steel sheet piles).
SELECT category_name, unit, item
FROM temp_materials
WHERE is_rentable AND item_group = 'Material'
ORDER BY category_name, item;
 
-- Purpose: rentable vs for sale. Result: Material 10 / 324, Machine 26 / 0.
SELECT item_group, SUM(is_rentable) AS rentable, SUM(NOT is_rentable) AS for_sale
FROM temp_materials
WHERE item_group IN ('Material', 'Machine')
GROUP BY item_group;
 
 
-- 2.5e Reject transactions for out-of-scope items ----------------------------
 
-- Find
-- Purpose: view of items Project Flow does not offer.
CREATE OR REPLACE VIEW v_out_of_scope_items AS
SELECT material_id, item, unit, item_group
FROM temp_materials
WHERE item_group NOT IN ('Material', 'Machine');
 
-- Purpose: count them. Result: Construction work 37, Labour 35, Testing 24,
-- Unidentified 2 (98 items).
SELECT item_group, COUNT(*) AS items
FROM v_out_of_scope_items
GROUP BY item_group
ORDER BY items DESC;
 
-- Fix
-- Purpose: label their transactions. A normal JOIN is used because the
-- matching item is needed to read its group. Result: 8825 rows.
UPDATE temp_transactions t
JOIN temp_materials m ON m.material_id = t.material_id
SET t.reject_reason = 'out-of-scope item'
WHERE t.reject_reason IS NULL
  AND m.item_group NOT IN ('Material', 'Machine');
 
-- Verify
-- Purpose: final rejection report. Result: valid 33305, out-of-scope item
-- 8825, date before 2000 5198, unknown company_id 2393, unknown
-- material_id 2226 (total 51947).
SELECT IFNULL(reject_reason, '(valid)') AS status, COUNT(*) AS transactions
FROM temp_transactions
GROUP BY status
ORDER BY transactions DESC;
 
 
-- =====================================================================
-- STEP 3: LOAD
-- Create the final ERD tables (with keys and constraints) and fill them
-- from the clean staging tables. Parents are created and filled before
-- children, because a foreign key can only point to existing rows.
-- Staging tables use source IDs (e.g. company 03028108); final tables use
-- new AUTO_INCREMENT IDs. JOINs on the kept source_* columns look up the
-- new IDs while loading.
-- =====================================================================
 
-- ---------------------------------------------------------------------
-- 3.1 Create the tables
-- Constraints keep the data correct when the system goes live:
--   PRIMARY KEY  unique row ID          FOREIGN KEY  value must exist in parent
--   NOT NULL     value required         UNIQUE       no two rows share the value
--   CHECK        value must pass a rule ENUM         value from a fixed list
-- Money uses DECIMAL (exact) instead of FLOAT (approximate).
-- ---------------------------------------------------------------------
 
-- Purpose: central account table. email is not UNIQUE (generic emails are
-- shared, see 2.2). password stores a SHA-256 hash (64 characters).
CREATE TABLE Users (
    user_id           INT AUTO_INCREMENT PRIMARY KEY,
    source_company_id CHAR(8)      NOT NULL UNIQUE,
    username          VARCHAR(100) NOT NULL UNIQUE,
    company_name      VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    password          CHAR(64)     NOT NULL,
    phone             VARCHAR(30),
    address           VARCHAR(255),
    account_type      ENUM('Contractor', 'Supplier', 'Rental', 'Admin') NOT NULL
);
 
-- Purpose: role tables. user_id UNIQUE = a user has at most one row per role.
CREATE TABLE Contractors (
    contractor_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL UNIQUE,
    role          VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
 
CREATE TABLE Suppliers (
    supplier_id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL UNIQUE,
    iso_certification   VARCHAR(100),
    verification_status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
 
CREATE TABLE EquipmentRentals (
    rental_partner_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id           INT NOT NULL UNIQUE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
 
-- Purpose: category names stored once (3NF).
CREATE TABLE Categories (
    category_id   INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE
);
 
-- Purpose: one catalog for materials and equipment. listed_by may be NULL
-- because the source data does not say who lists each item.
CREATE TABLE Items (
    item_id            INT AUTO_INCREMENT PRIMARY KEY,
    source_material_id CHAR(8)       NOT NULL UNIQUE,
    category_id        INT           NOT NULL,
    listed_by          INT           NULL,
    item_name          VARCHAR(255)  NOT NULL,
    unit               VARCHAR(20)   NOT NULL,
    avg_price          DECIMAL(12,2) NOT NULL CHECK (avg_price >= 0),
    is_rentable        BOOLEAN       NOT NULL DEFAULT FALSE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (listed_by)   REFERENCES Users(user_id)
);
 
-- Purpose: projects and their documents (no source data, filled by the app).
CREATE TABLE Projects (
    proj_id       INT AUTO_INCREMENT PRIMARY KEY,
    contractor_id INT NOT NULL,
    proj_name     VARCHAR(255) NOT NULL,
    proj_address  VARCHAR(255),
    proj_phase    VARCHAR(50),
    FOREIGN KEY (contractor_id) REFERENCES Contractors(contractor_id)
);
 
CREATE TABLE ProjectDocumentation (
    doc_id   INT AUTO_INCREMENT PRIMARY KEY,
    proj_id  INT NOT NULL,
    doc_type VARCHAR(50),
    doc_url  VARCHAR(500),
    FOREIGN KEY (proj_id) REFERENCES Projects(proj_id)
);
 
-- Purpose: order headers. total_value is the commission base.
CREATE TABLE PurchaseOrders (
    order_id              INT AUTO_INCREMENT PRIMARY KEY,
    source_transaction_id CHAR(8)       NOT NULL UNIQUE,
    contractor_id         INT           NOT NULL,
    proj_id               INT           NULL,
    order_date            DATE          NOT NULL,
    order_status          ENUM('Pending', 'Processed', 'Delivered') NOT NULL DEFAULT 'Pending',
    total_value           DECIMAL(14,2) NOT NULL CHECK (total_value >= 0),
    FOREIGN KEY (contractor_id) REFERENCES Contractors(contractor_id),
    FOREIGN KEY (proj_id)       REFERENCES Projects(proj_id)
);
 
-- Purpose: order lines. Composite key = an item appears once per order.
-- CHECK rules block impossible values (negative quantity, 150% discount).
CREATE TABLE OrderItems (
    order_id      INT           NOT NULL,
    item_id       INT           NOT NULL,
    quantity      INT           NOT NULL CHECK (quantity > 0),
    unit_price    DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    discount_rate DECIMAL(5,2)  NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
    PRIMARY KEY (order_id, item_id),
    FOREIGN KEY (order_id) REFERENCES PurchaseOrders(order_id),
    FOREIGN KEY (item_id)  REFERENCES Items(item_id)
);
 
-- Purpose: notifications (no source data, filled by the app).
CREATE TABLE Notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT          NOT NULL,
    order_id        INT          NULL,
    message         VARCHAR(500) NOT NULL,
    is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES Users(user_id),
    FOREIGN KEY (order_id) REFERENCES PurchaseOrders(order_id)
);
 
-- Purpose: confirm the 11 final tables exist.
SHOW TABLES;
 
 
-- ---------------------------------------------------------------------
-- 3.2 Insert the data (INSERT ... SELECT from the clean staging tables)
-- ---------------------------------------------------------------------
 
-- 3.2a Users ------------------------------------------------------------
 
-- Find
-- Purpose: list the 20 business types in the description (the part before
-- " - "). account_type is derived from them. Only descriptions that clearly
-- say so become Rental or Supplier; all others describe construction work.
SELECT SUBSTRING_INDEX(description, ' - ', 1) AS business, COUNT(*) AS companies
FROM temp_companies
GROUP BY business
ORDER BY companies DESC;
 
-- Purpose: show that company names often contradict the description
-- (e.g. "Crest Hardware" - historic restoration). Names are brand names,
-- so the description decides the account type.
SELECT name, SUBSTRING_INDEX(description, ' - ', 1) AS business
FROM temp_companies
WHERE name REGEXP 'supply|hardware|materials'
  AND description NOT LIKE 'Supplier of%'
  AND description NOT LIKE 'Provider of%'
  AND description NOT LIKE '%materials%'
LIMIT 5;
 
-- Load
-- Purpose: one user per company.
--   username    = company name in lowercase with "_" + source ID (always unique,
--                 because 67 names are shared)
--   password    = placeholder SHA-256 hash (no real logins in the source data)
--   account_type: "Construction equipment rental" -> Rental;
--                 "Supplier of", "Provider of", "... materials" -> Supplier;
--                 everything else (incl. temporary traffic and fencing,
--                 structural steel fabrication and erection) -> Contractor.
-- Result: 500 rows.
INSERT INTO Users (source_company_id, username, company_name, email, password, phone, address, account_type)
SELECT company_id,
       CONCAT(LOWER(TRIM(BOTH '_' FROM REGEXP_REPLACE(name, '[^A-Za-z0-9]+', '_'))), '_', company_id),
       name,
       email,
       SHA2(CONCAT('changeme-', company_id), 256),
       phone,
       address,
       CASE
         WHEN description LIKE 'Construction equipment rental%' THEN 'Rental'
         WHEN description LIKE 'Supplier of%'
           OR description LIKE 'Provider of%'
           OR description LIKE '%materials%' THEN 'Supplier'
         ELSE 'Contractor'
       END
FROM temp_companies
ORDER BY row_no;
 
-- Verify
-- Purpose: count users per type. Result: Contractor 375, Supplier 98, Rental 27.
SELECT account_type, COUNT(*) AS users FROM Users GROUP BY account_type;
 
-- Purpose: sample rows (first user = first company in the file).
SELECT user_id, source_company_id, username, company_name, phone, account_type
FROM Users LIMIT 3;
 
 
-- 3.2b Role tables --------------------------------------------------------
 
-- Purpose: every company placed valid orders, so every user is also a buyer
-- (Contractor). Result: 500 rows.
INSERT INTO Contractors (user_id)
SELECT user_id FROM Users ORDER BY user_id;
 
-- Purpose: supplier role follows account_type. verification_status gets its
-- default 'Pending'. Result: 98 rows.
INSERT INTO Suppliers (user_id)
SELECT user_id FROM Users WHERE account_type = 'Supplier' ORDER BY user_id;
 
-- Purpose: rental role follows account_type. Result: 27 rows.
INSERT INTO EquipmentRentals (user_id)
SELECT user_id FROM Users WHERE account_type = 'Rental' ORDER BY user_id;
 
-- Purpose: verify. Result: 500 / 98 / 27.
SELECT (SELECT COUNT(*) FROM Contractors)      AS contractors,
       (SELECT COUNT(*) FROM Suppliers)        AS suppliers,
       (SELECT COUNT(*) FROM EquipmentRentals) AS rental_partners;
 
 
-- 3.2c Categories ----------------------------------------------------------
 
-- Purpose: each category name once. Result: 10 rows.
INSERT INTO Categories (category_name)
SELECT DISTINCT category_name
FROM temp_materials
WHERE category_name IS NOT NULL
ORDER BY category_name;
 
-- Purpose: verify.
SELECT * FROM Categories;
 
 
-- 3.2d Items ---------------------------------------------------------------
 
-- Purpose: load the in-scope items. JOIN Categories turns the category name
-- into its new category_id. Result: 360 rows.
INSERT INTO Items (source_material_id, category_id, listed_by, item_name, unit, avg_price, is_rentable)
SELECT m.material_id,
       c.category_id,
       NULL,
       m.item,
       m.unit,
       CAST(m.price_avg AS DECIMAL(12,2)),
       m.is_rentable
FROM temp_materials m
JOIN Categories c ON c.category_name = m.category_name
WHERE m.item_group IN ('Material', 'Machine')
ORDER BY m.row_no;
 
-- Purpose: verify. Result: 360 items, 36 rentable.
SELECT COUNT(*) AS items, SUM(is_rentable) AS rentable FROM Items;
 
 
-- 3.2e PurchaseOrders ---------------------------------------------------------
 
-- Purpose: one order per valid transaction. Two JOINs look up the new IDs:
-- company_id -> user_id -> contractor_id. Only unlabelled rows
-- (reject_reason IS NULL) are loaded. total_value is the recalculated exact
-- total from 2.4e. Historical orders get status 'Delivered'.
-- Result: 33305 rows.
INSERT INTO PurchaseOrders (source_transaction_id, contractor_id, proj_id, order_date, order_status, total_value)
SELECT t.transaction_id,
       ct.contractor_id,
       NULL,
       STR_TO_DATE(t.transaction_date, '%Y-%m-%d'),
       'Delivered',
       t.total_value
FROM temp_transactions t
JOIN Users u        ON u.source_company_id = t.company_id
JOIN Contractors ct ON ct.user_id          = u.user_id
WHERE t.reject_reason IS NULL
ORDER BY t.row_no;
 
-- Purpose: verify. Result: 33305 orders, 2018-01-01 to 2025-07-31.
SELECT COUNT(*) AS orders, MIN(order_date) AS first_order, MAX(order_date) AS last_order
FROM PurchaseOrders;
 
 
-- 3.2f OrderItems --------------------------------------------------------------
 
-- Purpose: one line per order. JOINs look up the new order_id and item_id.
-- Result: 33305 rows.
INSERT INTO OrderItems (order_id, item_id, quantity, unit_price, discount_rate)
SELECT po.order_id,
       i.item_id,
       CAST(t.quantity AS UNSIGNED),
       CAST(t.price_per_unit AS DECIMAL(12,2)),
       CAST(t.discount_rate AS DECIMAL(5,2))
FROM temp_transactions t
JOIN PurchaseOrders po ON po.source_transaction_id = t.transaction_id
JOIN Items i           ON i.source_material_id    = t.material_id
WHERE t.reject_reason IS NULL;
 
-- Purpose: verify. ("lines" is a reserved word, so the alias is order_lines.)
-- Result: 33305.
SELECT COUNT(*) AS order_lines FROM OrderItems;
 
-- Purpose: purchases vs rentals. Result: 29962 (for sale) / 3343 (rentable).
SELECT i.is_rentable, COUNT(*) AS order_lines
FROM OrderItems oi
JOIN Items i ON i.item_id = oi.item_id
GROUP BY i.is_rentable;
 
-- Projects, ProjectDocumentation and Notifications have no source data and
-- stay empty; the application fills them.
 
 
-- =====================================================================
-- STEP 4: VALIDATE
-- Read-only checks on the whole result. 0 means "no problem found".
-- =====================================================================
 
-- 4a Row accounting ----------------------------------------------------------
 
-- Purpose: every raw row is either loaded or rejected (loaded + rejected = raw).
-- Result: companies 500 / 500 / 0, materials 458 / 360 / 98,
-- transactions 51947 / 33305 / 18642.
SELECT 'companies' AS source,
       (SELECT COUNT(*) FROM temp_companies) AS raw_rows,
       (SELECT COUNT(*) FROM Users)          AS loaded,
       0                                     AS rejected
UNION ALL
SELECT 'materials',
       (SELECT COUNT(*) FROM temp_materials),
       (SELECT COUNT(*) FROM Items),
       (SELECT COUNT(*) FROM temp_materials WHERE item_group NOT IN ('Material', 'Machine'))
UNION ALL
SELECT 'transactions',
       (SELECT COUNT(*) FROM temp_transactions),
       (SELECT COUNT(*) FROM PurchaseOrders),
       (SELECT COUNT(*) FROM temp_transactions WHERE reject_reason IS NOT NULL);
 
-- Purpose: no rejected transaction was loaded. Result: 0.
SELECT COUNT(*) AS rejected_but_loaded
FROM temp_transactions t
JOIN PurchaseOrders po ON po.source_transaction_id = t.transaction_id
WHERE t.reject_reason IS NOT NULL;
 
 
-- 4b Relationships (LEFT JOIN + IS NULL on the final tables) ------------------
 
-- Purpose: no orphans in either direction. Foreign keys only check
-- child -> parent; this also checks e.g. orders without any line.
-- Result: 0 in every column.
SELECT
 (SELECT COUNT(*) FROM PurchaseOrders po
    LEFT JOIN Contractors c ON c.contractor_id = po.contractor_id
    WHERE c.contractor_id IS NULL)                                   AS orders_without_contractor,
 (SELECT COUNT(*) FROM OrderItems oi
    LEFT JOIN PurchaseOrders po ON po.order_id = oi.order_id
    WHERE po.order_id IS NULL)                                       AS lines_without_order,
 (SELECT COUNT(*) FROM OrderItems oi
    LEFT JOIN Items i ON i.item_id = oi.item_id
    WHERE i.item_id IS NULL)                                         AS lines_without_item,
 (SELECT COUNT(*) FROM PurchaseOrders po
    LEFT JOIN OrderItems oi ON oi.order_id = po.order_id
    WHERE oi.order_id IS NULL)                                       AS orders_without_lines,
 (SELECT COUNT(*) FROM Items i
    LEFT JOIN Categories c ON c.category_id = i.category_id
    WHERE c.category_id IS NULL)                                     AS items_without_category,
 (SELECT COUNT(*) FROM Users u
    LEFT JOIN Contractors c ON c.user_id = u.user_id
    WHERE c.user_id IS NULL)                                         AS users_without_contractor_row;
 
 
-- 4c Numbers -------------------------------------------------------------------
 
-- Purpose: every order total equals quantity x unit_price x (1 - discount)
-- recalculated from the final tables. Result: 0.
SELECT COUNT(*) AS total_mismatches
FROM PurchaseOrders po
JOIN OrderItems oi ON oi.order_id = po.order_id
WHERE po.total_value <> ROUND(oi.quantity * oi.unit_price * (1 - oi.discount_rate / 100), 2);
 
-- Purpose: the grand total did not change during the load.
-- Result: both 18807970344.00.
SELECT (SELECT SUM(total_value) FROM temp_transactions WHERE reject_reason IS NULL) AS staging_total,
       (SELECT SUM(total_value) FROM PurchaseOrders)                                 AS loaded_total;
 
 
-- 4d Business sense ------------------------------------------------------------
 
-- Purpose: role tables match account types.
-- Result: Contractor 375/0/0, Supplier 98/98/0, Rental 27/0/27.
SELECT u.account_type,
       COUNT(*)                             AS users,
       SUM(s.supplier_id IS NOT NULL)       AS in_suppliers,
       SUM(r.rental_partner_id IS NOT NULL) AS in_rentals
FROM Users u
LEFT JOIN Suppliers s        ON s.user_id = u.user_id
LEFT JOIN EquipmentRentals r ON r.user_id = u.user_id
GROUP BY u.account_type;
 
-- Purpose: order dates are in the real range.
-- Result: 2018-01-01 to 2025-07-31, too_old 0, future 0.
SELECT MIN(order_date) AS first_order, MAX(order_date) AS last_order,
       SUM(order_date < '2018-01-01') AS too_old,
       SUM(order_date > CURDATE())    AS future
FROM PurchaseOrders;
 
-- Purpose: catalog per category. Result: 10 categories, 360 items;
-- Machines 26/26 rentable, Safety & Site Equipment 8, Steel & Metal 2.
SELECT c.category_name, COUNT(*) AS items, SUM(i.is_rentable) AS rentable
FROM Items i
JOIN Categories c ON c.category_id = i.category_id
GROUP BY c.category_name
ORDER BY items DESC;
 
 
-- 4e Trace one record from raw to final ----------------------------------------
 
-- Purpose: follow transaction 66227135 (the broken-total example) through
-- every table. Result: raw total 25000 -> total_value 3725000.00
-- (149 x 25000), company Allied Roofing, date 2018-07-30.
SELECT t.transaction_id, t.quantity AS raw_qty, t.price_per_unit AS raw_price,
       t.total_price AS raw_total, t.transaction_date AS raw_date,
       u.company_name, i.item_name,
       oi.quantity, oi.unit_price, po.total_value, po.order_date
FROM temp_transactions t
JOIN PurchaseOrders po ON po.source_transaction_id = t.transaction_id
JOIN OrderItems oi     ON oi.order_id = po.order_id
JOIN Items i           ON i.item_id = oi.item_id
JOIN Contractors ct    ON ct.contractor_id = po.contractor_id
JOIN Users u           ON u.user_id = ct.user_id
WHERE t.transaction_id = '66227135';
 
 
-- 4f Final summary --------------------------------------------------------------
 
-- Purpose: row count of every final table. Result: Users 500, Contractors 500,
-- Suppliers 98, EquipmentRentals 27, Categories 10, Items 360,
-- PurchaseOrders 33305, OrderItems 33305, Projects 0,
-- ProjectDocumentation 0, Notifications 0.
SELECT 'Users' AS table_name, COUNT(*) AS row_count FROM Users
UNION ALL SELECT 'Contractors',          COUNT(*) FROM Contractors
UNION ALL SELECT 'Suppliers',            COUNT(*) FROM Suppliers
UNION ALL SELECT 'EquipmentRentals',     COUNT(*) FROM EquipmentRentals
UNION ALL SELECT 'Categories',           COUNT(*) FROM Categories
UNION ALL SELECT 'Items',                COUNT(*) FROM Items
UNION ALL SELECT 'PurchaseOrders',       COUNT(*) FROM PurchaseOrders
UNION ALL SELECT 'OrderItems',           COUNT(*) FROM OrderItems
UNION ALL SELECT 'Projects',             COUNT(*) FROM Projects
UNION ALL SELECT 'ProjectDocumentation', COUNT(*) FROM ProjectDocumentation
UNION ALL SELECT 'Notifications',        COUNT(*) FROM Notifications;
 
 
-- Constraint tests (run by hand, NOT part of this script, because an error
-- stops the script). Each must FAIL - that proves the rules protect the data:
--   INSERT INTO OrderItems (order_id, item_id, quantity, unit_price, discount_rate)
--   VALUES (1, 999999, 5, 100, 0);   -- ERROR 1452: foreign key constraint fails
--   INSERT INTO OrderItems (order_id, item_id, quantity, unit_price, discount_rate)
--   VALUES (1, 2, -5, 100, 0);       -- ERROR 3819: check constraint violated
--   INSERT INTO Users (source_company_id, username, company_name, email, password, account_type)
--   VALUES ('99999999', 'test', 'Test', 'test@test.com', 'x', 'Customer');
--                                    -- ERROR 1265: value not allowed by the ENUM
 
-- The staging tables (temp_*) and views (v_*) are kept as evidence of the
-- cleaning steps. They can be removed with:
--   DROP VIEW v_dup_company_names, v_dup_company_emails, v_dup_material_names,
--             v_dup_transactions, v_unknown_company, v_unknown_material,
--             v_total_check, v_out_of_scope_items;
--   DROP TABLE temp_transactions, temp_materials, temp_companies;