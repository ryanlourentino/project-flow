-- Demo certificates for Suppliers (the source data has none), so the Verified badge has data.
-- About 70% of Suppliers (always the demo Supplier) get a made-up ISO certificate, clearly
-- marked "(demo)", and verification_status 'Approved'. The others stay 'Pending'.
-- Same CRC32 trick as the demo offers: varied, but identical on every computer.
USE projectflow;

UPDATE Suppliers s
  JOIN Users u ON u.user_id = s.user_id
   SET s.iso_certification = CONCAT(
         ELT(1 + CRC32(CONCAT(u.user_id, '-standard')) % 4,
             'ISO 9001:2015', 'ISO 9001:2015', 'ISO 14001:2015', 'ISO 45001:2018'),
         ' - No. PF-', LPAD(CRC32(CONCAT(u.user_id, '-number')) % 100000, 5, '0'),
         ' (demo)'),
       s.verification_status = 'Approved'
 WHERE s.iso_certification IS NULL
   AND (RAND(CRC32(CONCAT(u.user_id, '-certified'))) < 0.7
        OR u.username = 'superior_foundations_99_28001683');
