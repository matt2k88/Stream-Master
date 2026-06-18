-- 008_sports_news_badge.sql
-- Adds the admin toggle for the "NEW" badge on the Sports News menu entry.
-- Run this in your Supabase SQL editor.

alter table public.app_theme
  add column if not exists show_sports_news_badge boolean not null default true;

-- To hide the NEW badge, update the row:
-- update public.app_theme set show_sports_news_badge = false where id = 1;
