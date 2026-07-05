-- VenueScout smart tags registry (SPEC.md §3)
CREATE TABLE IF NOT EXISTS smart_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS tags text[];

-- Seed the registry with the default smart tags already used on locations
INSERT INTO smart_tags (name) VALUES
  ('conferenze'),
  ('gala_dinner'),
  ('lunch'),
  ('coffee'),
  ('feste'),
  ('lancio'),
  ('shooting'),
  ('wedding')
ON CONFLICT (name) DO NOTHING;
