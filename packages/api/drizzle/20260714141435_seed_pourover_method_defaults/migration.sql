-- Seed the system-default pour over method (userId NULL). Idempotent via the
-- unique index on name, matching the aeropress method defaults seeded in
-- 20260708204724_seed_aeropress_method_defaults.
INSERT INTO "pourover_methods" ("name") VALUES
	('Standard')
ON CONFLICT ("name") DO NOTHING;
