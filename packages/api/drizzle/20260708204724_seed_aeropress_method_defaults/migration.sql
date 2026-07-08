-- Seed system-default AeroPress methods (userId NULL). Idempotent via the
-- unique index on name, matching the brewing_device_types defaults seeded in
-- 20260622214201_overrated_marauders.
INSERT INTO "aeropress_methods" ("name") VALUES
	('Standard'),
	('Inverted')
ON CONFLICT ("name") DO NOTHING;