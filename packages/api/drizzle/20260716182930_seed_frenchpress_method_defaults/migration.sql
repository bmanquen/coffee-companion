-- Seed the system-default french press method (userId NULL). Idempotent via the
-- unique index on name, matching the pourover method defaults seeded in
-- 20260714141435_seed_pourover_method_defaults.
INSERT INTO "frenchpress_methods" ("name") VALUES
	('Standard')
ON CONFLICT ("name") DO NOTHING;