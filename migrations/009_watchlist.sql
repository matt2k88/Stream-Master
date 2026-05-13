-- Watchlist (lifetime DB)
-- The table already exists in production with this shape; this file
-- documents the schema so a fresh environment can recreate it.
--
-- Rows can be inserted from two sources:
--   1. The external "Add to Watchlist" page (TMDB-driven). content_id =
--      TMDB id (string) and content_data is a TMDB payload snapshot.
--   2. The mobile/TV app's MovieInfo / SeriesDetail screens. content_id
--      is the TMDB id when available; otherwise prefixed "xt_<streamId>".
--      content_data carries { stream_id, series_id?, name, poster, source }
--      so the app can auto-update status='watched' when the user finishes
--      the title via the in-app player.

create table if not exists watchlist (
  id            uuid primary key default gen_random_uuid(),
  user_username text not null,
  content_id    text not null,
  content_type  text not null check (content_type in ('movie', 'series')),
  content_data  jsonb,
  status        text not null default 'unwatched' check (status in ('unwatched', 'watched')),
  created_at    timestamptz not null default now()
);

create index if not exists watchlist_user_type_idx
  on watchlist (user_username, content_type, created_at desc);

-- One row per (user, content) so re-adds upsert cleanly.
create unique index if not exists watchlist_user_content_uidx
  on watchlist (user_username, content_id, content_type);
