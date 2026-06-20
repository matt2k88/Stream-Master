-- 027_music_badges.sql
-- Adds two admin-controlled badge toggles for the Music Player feature.
-- Both default true (badges visible) so they show on first deploy.
-- Flip either to false in the Supabase dashboard to hide the badge instantly.

alter table public.app_theme
  add column if not exists show_music_badge      boolean not null default true,
  add column if not exists show_music_beta_badge boolean not null default true;
