-- =====================================================================
-- Project Flow - ETL Script (MySQL)
-- Source files : companies.tsv, materials.tsv, transactions.tsv
-- Target model : ERD (ERDiagramMVP.md)
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
