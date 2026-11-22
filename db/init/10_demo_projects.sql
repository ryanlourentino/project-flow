-- Demo construction projects for the demo Contractor account (central_hardware_03028108),
-- so the Projects page has data in a fresh database. Safe to run again (NOT EXISTS).
USE projectflow;

INSERT INTO Projects (contractor_id, proj_name, proj_address, proj_phase)
SELECT c.contractor_id, p.proj_name, p.proj_address, p.proj_phase
  FROM Contractors c
  JOIN Users u ON u.user_id = c.user_id AND u.username = 'central_hardware_03028108'
 CROSS JOIN (
         SELECT 'Riverside Apartments, Block A' AS proj_name, '120 Riverside Rd, Springfield, IL 62701' AS proj_address, 'Structure' AS proj_phase
   UNION SELECT 'Northgate Warehouse',                         '45 Industrial Pkwy, Columbus, OH 43215',               'Foundation'
   UNION SELECT 'Lakeview Elementary School Renovation',       '9 Lakeview Dr, Madison, WI 53703',                     'Planning'
       ) AS p
 WHERE NOT EXISTS (SELECT 1 FROM Projects x WHERE x.contractor_id = c.contractor_id AND x.proj_name = p.proj_name);
