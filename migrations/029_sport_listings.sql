-- Migration 029: Sports Listings (Telegram + GPT Vision)
-- Run in Supabase SQL Editor.
-- Fully idempotent: safe to re-run.

-- ── sport_listing_images ──────────────────────────────────────────────────────
-- Stores raw Telegram photo messages received from the group.
-- GPT Vision results are cached here so re-syncs don't re-call the API.
CREATE TABLE IF NOT EXISTS sport_listing_images (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  message_date    DATE        NOT NULL,
  telegram_msg_id BIGINT      NOT NULL,
  file_unique_id  TEXT        NOT NULL,
  file_id         TEXT        NOT NULL,
  gpt_result      JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sport_listing_image
  ON sport_listing_images(file_unique_id);

CREATE INDEX IF NOT EXISTS idx_sport_listing_images_date
  ON sport_listing_images(message_date, telegram_msg_id);

-- ── sport_listings ────────────────────────────────────────────────────────────
-- Parsed output: one row per (date, sport, competition).
CREATE TABLE IF NOT EXISTS sport_listings (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_date     DATE        NOT NULL,
  sport_key     TEXT        NOT NULL,
  sport_label   TEXT        NOT NULL,
  competition   TEXT        NOT NULL,
  matches       JSONB       NOT NULL DEFAULT '[]',
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sport_listing
  ON sport_listings(sync_date, sport_key, competition);

CREATE INDEX IF NOT EXISTS idx_sport_listings_date
  ON sport_listings(sync_date, display_order);

-- ── sport_sync_state ──────────────────────────────────────────────────────────
-- Single-row table storing the Telegram getUpdates offset.
CREATE TABLE IF NOT EXISTS sport_sync_state (
  id         INTEGER     PRIMARY KEY DEFAULT 1,
  tg_offset  BIGINT      NOT NULL    DEFAULT 0,
  updated_at TIMESTAMPTZ             DEFAULT NOW()
);

INSERT INTO sport_sync_state (id, tg_offset)
  VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;
