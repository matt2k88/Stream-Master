-- Migration 035: Ultra Music access + config tables
-- Mirrors the ultra_tube_access / ultra_tube_config pattern.
-- Run this migration before expecting Ultra Music access checks to work.
-- Until run, both endpoints fall back to hardcoded defaults and access check
-- returns { hasAccess: false } gracefully.

-- Maps each ultracast account username to Ultra Music credentials
CREATE TABLE IF NOT EXISTS ultra_music_access (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  username              text        NOT NULL UNIQUE,   -- ultracast iptv account username (lowercase)
  ultra_music_username  text        NOT NULL,
  ultra_music_password  text        NOT NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Single-row config: APK download URL, downloader code, show_badge toggle
CREATE TABLE IF NOT EXISTS ultra_music_config (
  id              int         PRIMARY KEY,
  apk_url         text        NOT NULL DEFAULT 'https://app.ultracast.co.uk/ultramusic.apk',
  downloader_code text        NOT NULL DEFAULT '',
  show_badge      boolean     NOT NULL DEFAULT true,
  updated_at      timestamptz DEFAULT now()
);

-- Seed the single config row (no-op if already present)
INSERT INTO ultra_music_config (id, apk_url, downloader_code, show_badge)
VALUES (1, 'https://app.ultracast.co.uk/ultramusic.apk', '', true)
ON CONFLICT (id) DO NOTHING;
