-- Short descriptions for the categories from the ETL, shown on the Categories page.
-- Only fills categories that have no description yet, so an Admin's own text is never overwritten.
USE projectflow;

UPDATE Categories
   SET description = CASE category_name
         WHEN 'Aggregates & Soil'       THEN 'Sand, gravel, crushed stone and backfill for foundations and road bases.'
         WHEN 'Asphalt & Paving'        THEN 'Asphalt layers, paving tiles and road markings.'
         WHEN 'Concrete & Cement'       THEN 'Portland cement, ready-mix concrete and non-shrink mortar.'
         WHEN 'Formwork & Timber'       THEN 'Plywood, formwork timber and steel formwork for concrete work.'
         WHEN 'Landscaping'             THEN 'Grass, seeds, fertilizer and slope protection for green areas.'
         WHEN 'Machines'                THEN 'Construction machines with operators, such as rollers, cranes and pumps.'
         WHEN 'Others'                  THEN 'Sealants, tiles, ceilings, joints and other site materials.'
         WHEN 'Pipes & Drainage'        THEN 'Reinforced concrete pipes, waterstops and drainage products.'
         WHEN 'Safety & Site Equipment' THEN 'Occupational safety and health products and site equipment.'
         WHEN 'Steel & Metal'           THEN 'Steel bars, structural steel, wire, mesh and nails.'
       END
 WHERE description IS NULL
   AND category_name IN ('Aggregates & Soil', 'Asphalt & Paving', 'Concrete & Cement', 'Formwork & Timber',
                         'Landscaping', 'Machines', 'Others', 'Pipes & Drainage',
                         'Safety & Site Equipment', 'Steel & Metal');
