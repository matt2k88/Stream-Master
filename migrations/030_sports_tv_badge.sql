-- Migration 030: Sports on TV menu badge
-- Run in Supabase SQL Editor.
-- Fully idempotent: safe to re-run.

ALTER TABLE app_theme
  ADD COLUMN IF NOT EXISTS show_sports_tv_badge BOOLEAN NOT NULL DEFAULT true;
