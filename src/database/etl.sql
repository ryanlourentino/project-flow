-- Create database and set character encoding
CREATE DATABASE IF NOT EXISTS projectflow;
USE projectflow;
SET NAMES 'utf8mb4';

-- Create temporary staging tables
CREATE TABLE temp_companies (
    company_id VARCHAR(20),
    name VARCHAR(255),
    description TEXT,
    address VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(100),
    comments TEXT
);

LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv' 
INTO TABLE temp_companies 
FIELDS TERMINATED BY '\t'  
OPTIONALLY ENCLOSED BY '"' 
LINES TERMINATED BY '\n' 
IGNORE 1 ROWS;

CREATE TABLE temp_transactions (
    transaction_id VARCHAR(20),
    company_id VARCHAR(100),
    material_id VARCHAR(100),
    quantity VARCHAR(100),
    price_per_unit VARCHAR(50),
    discount_rate VARCHAR(100),
    total_price VARCHAR(100),
    transaction_date VARCHAR(50),
    notes TEXT
);

LOAD DATA INFILE '/var/lib/mysql-files/transactions.tsv'
INTO TABLE temp_transactions
FIELDS TERMINATED BY '\t'
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

CREATE TABLE temp_materials ( 
    material_id VARCHAR(20), 
    item TEXT, 
    unit VARCHAR(50), 
    price_avg DECIMAL(10,2), 
    price_stdev DECIMAL(10,2), 
    no_samples INT 
); 

LOAD DATA INFILE '/var/lib/mysql-files/materials.tsv' 
INTO TABLE temp_materials 
FIELDS TERMINATED BY '\t'  
OPTIONALLY ENCLOSED BY '"' 
LINES TERMINATED BY '\n' 
IGNORE 1 ROWS;

-- Filtered staging tables / create target normalized tables
DROP TABLE IF EXISTS filtered_transactions, filtered_materials, filtered_companies;

CREATE TABLE filtered_transactions (
    transaction_id VARCHAR(20), 
    company_id VARCHAR(100), 
    material_id VARCHAR(100),
    quantity VARCHAR(100), 
    price_per_unit VARCHAR(50), 
    discount_rate VARCHAR(100),
    total_price VARCHAR(100), 
    transaction_date VARCHAR(50), 
    notes TEXT
);

INSERT INTO filtered_transactions
SELECT
    T.*
FROM
    temp_transactions AS T
WHERE
    STR_TO_DATE(T.transaction_date, '%Y-%m-%d') > '2000-01-01'
    AND STR_TO_DATE(T.transaction_date, '%Y-%m-%d') IS NOT NULL;

CREATE TABLE filtered_materials (
    material_id VARCHAR(100), 
    Item TEXT, 
    Unit VARCHAR(100),
    PriceAvg VARCHAR(100), 
    PriceStdev VARCHAR(100), 
    NoSamples VARCHAR(100) 
);

INSERT INTO filtered_materials
SELECT DISTINCT
    M.*
FROM
    temp_materials AS M
INNER JOIN
    filtered_transactions AS FT ON M.material_id = FT.material_id;

CREATE TABLE filtered_companies (
    company_id VARCHAR(20), 
    name VARCHAR(255), 
    description TEXT,
    address VARCHAR(255), 
    phone VARCHAR(50), 
    email VARCHAR(100), 
    comments TEXT
);

INSERT INTO filtered_companies
SELECT DISTINCT
    C.*
FROM
    temp_companies AS C
INNER JOIN
    filtered_transactions AS FT ON C.company_id = FT.company_id;
