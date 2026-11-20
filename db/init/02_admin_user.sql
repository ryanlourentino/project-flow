-- Admin account for managing the catalog (the ETL data has no admin).
-- Login: username "admin", password "admin1234" (stored as a SHA-256 hash like the other users).
-- Change this password before any real use.
USE projectflow;

INSERT INTO Users (source_company_id, username, company_name, email, password, phone, address, account_type)
VALUES ('00000000', 'admin', 'Project Flow Admin', 'admin@projectflow.local',
        SHA2('admin1234', 256), NULL, NULL, 'Admin');