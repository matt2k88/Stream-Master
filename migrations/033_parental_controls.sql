-- Migration 033: Parental Controls per profile
-- Adds parental_pin (plain-text 4-digit) and parental_controls (JSONB config)
-- to profiles. Both nullable; null / disabled means no filtering is applied.
--
-- parental_controls shape:
--   { enabled: bool, allowed_ratings: string[], show_unclassified: bool }
--   allowed_ratings is a subset of ["U","PG","12A","12","15","18","R18"]
--
-- Until this migration is run the PUT /api/profiles/:id endpoint silently
-- drops both new fields; all existing screens keep working unchanged.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS parental_pin TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parental_controls JSONB DEFAULT NULL;
