-- 023_private_viewing.sql
-- Adds per-profile Private Viewing flag to the profiles table.
-- When true, the server skips inserting any recently_watched rows for that
-- profile so no watch history is stored while the mode is active.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS private_viewing boolean NOT NULL DEFAULT false;
