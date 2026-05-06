-- Run this in the Supabase SQL Editor (Project → SQL → New query)
-- Adds playback-progress tracking to recently_watched.

-- "current_time" must be quoted because it's a reserved SQL keyword.
ALTER TABLE recently_watched
  ADD COLUMN IF NOT EXISTS "current_time" numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_completed   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS series_id      text,
  ADD COLUMN IF NOT EXISTS season_num     integer,
  ADD COLUMN IF NOT EXISTS episode_num    integer;
