-- Migration 028: Music playlists per profile
-- Run in Supabase SQL Editor
-- Fully idempotent: safe to re-run if a previous attempt partially succeeded.

CREATE TABLE IF NOT EXISTS music_playlists (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  is_liked_songs BOOLEAN  DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_playlist_tracks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID        NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  artist      TEXT        NOT NULL,
  album       TEXT        DEFAULT '',
  duration_sec INTEGER    DEFAULT 0,
  thumbnail   TEXT        DEFAULT '',
  position    INTEGER     DEFAULT 0,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Add search_key if the table was created without it (partial previous run)
ALTER TABLE music_playlist_tracks
  ADD COLUMN IF NOT EXISTS search_key TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_music_playlists_profile
  ON music_playlists(profile_id);

CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_playlist
  ON music_playlist_tracks(playlist_id, position);

-- Prevent duplicate tracks in the same playlist
CREATE UNIQUE INDEX IF NOT EXISTS uniq_music_playlist_track
  ON music_playlist_tracks(playlist_id, search_key);
