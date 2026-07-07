-- POI enhancements (SPEC.md §4): address/city/notes on points of interest.
ALTER TABLE pois ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS notes text;
