-- One-shot fix: Суздаль had stale coords (56.8556, 41.3833) that overlap
-- with Шуя. Real Суздаль is in Vladimir oblast at (56.4194, 40.4493).
UPDATE "Cities" SET "Latitude" = 56.4194, "Longitude" = 40.4493 WHERE "Name" = 'Суздаль';

SELECT "Name", "Latitude", "Longitude" FROM "Cities" WHERE "Name" IN ('Суздаль', 'Шуя');
