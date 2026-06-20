-- Migration 028: Music playlists per profile
-- Run in Supabase SQL Editor
-- Fully idempotent: safe to re-run regardless of how much was done previously.

-- ── music_playlists ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS music_playlists (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Patch columns that may be missing from a partial earlier run
ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS is_liked_songs BOOLEAN DEFAULT false;

-- ── music_playlist_tracks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS music_playlist_tracks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID        NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  artist      TEXT        NOT NULL,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Patch every optional column individually (idempotent ADD COLUMN IF NOT EXISTS)
ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS album        TEXT    DEFAULT '';
ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS duration_sec INTEGER DEFAULT 0;
ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS thumbnail    TEXT    DEFAULT '';
ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS position     INTEGER DEFAULT 0;
ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS search_key   TEXT    NOT NULL DEFAULT '';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_music_playlists_profile
  ON music_playlists(profile_id);

CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_playlist
  ON music_playlist_tracks(playlist_id, position);

-- Prevent duplicate tracks in the same playlist
CREATE UNIQUE INDEX IF NOT EXISTS uniq_music_playlist_track
  ON music_playlist_tracks(playlist_id, search_key);
