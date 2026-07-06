-- VenueScout location direct contact fields (SPEC.md §3):
-- the venue card exposes its own phone/email/website, distinct from linked contacts.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS website text;
