-- 021_advert_orientation.sql
-- Adds an `orientation` column to `adverts` so landscape (TV) and portrait
-- (mobile) banners can show different images.
--
-- Values:
--   'landscape' — only shown in the landscape / TV banner (design at 1920x600, 16:5)
--   'portrait'  — only shown in the portrait mobile banner (design at 1920x1080, 16:9)
--   NULL        — untagged: shown in BOTH orientations (existing rows stay visible)
--
-- The client falls back to showing all ads if none match the current
-- orientation, and the server tolerates this column being absent, so adverts
-- keep working before this migration is applied.

ALTER TABLE adverts
  ADD COLUMN IF NOT EXISTS orientation text;

ALTER TABLE adverts
  DROP CONSTRAINT IF EXISTS adverts_orientation_check;

ALTER TABLE adverts
  ADD CONSTRAINT adverts_orientation_check
  CHECK (orientation IS NULL OR orientation IN ('landscape', 'portrait'));
