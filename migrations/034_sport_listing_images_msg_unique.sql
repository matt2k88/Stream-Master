-- Migration 034: Fix sport_listing_images deduplication key
-- Run in Supabase SQL Editor.
-- Fully idempotent: safe to re-run.
--
-- Problem: the original unique index on (message_date, file_unique_id) dropped
-- any re-posted header image within the same day.  If an admin re-sends the
-- Football header image mid-day, the duplicate upsert was silently ignored,
-- leaving subsequent listing cards with no preceding header and therefore
-- mis-classified under the wrong sport.
--
-- Fix: deduplicate on telegram_msg_id instead (globally unique per Telegram
-- chat).  Each re-post gets its own row, preserving chronological order.
-- GPT results are still cached: the sync route looks up gpt_result by
-- file_unique_id before calling the API, so re-posted identical images incur
-- zero extra GPT cost.

-- Drop the old (message_date, file_unique_id) unique index.
DROP INDEX IF EXISTS uniq_sport_listing_image;

-- Add unique index on telegram_msg_id (unique within a Telegram chat).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sport_listing_image_msg
  ON sport_listing_images(telegram_msg_id);
