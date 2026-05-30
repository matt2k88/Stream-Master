-- Live Football Scores feature.
--
-- football_prefs: per-profile tracker settings. One row per profile.
--   league_id = the single api-football league/competition id the user wants
--   to track (null = none selected). corner = which screen corner the floating
--   tracker renders in.
--
-- football_scores: server-maintained cache of live fixtures. The server polls
--   api-football `fixtures?live=all` and upserts rows here; all clients read
--   from this table (every ~30s) instead of hitting the API directly. Finished
--   games keep `finished_at` set and are purged ~15 min later.

create table if not exists football_prefs (
  profile_id uuid primary key references profiles(id) on delete cascade,
  league_id integer,
  corner text not null default 'top-right'
    check (corner in ('top-left','top-right','bottom-left','bottom-right','middle-left','middle-right')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists football_scores (
  fixture_id bigint primary key,
  league_id integer not null,
  league_name text,
  league_country text,
  home_team text,
  away_team text,
  home_goals integer not null default 0,
  away_goals integer not null default 0,
  status_short text,
  elapsed integer,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists football_scores_league_idx
  on football_scores (league_id);
