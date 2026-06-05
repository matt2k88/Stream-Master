-- Per-profile favourite football team.
--
-- Each profile picks its own favourite team, stored here in the MAIN db.
-- team_data is the api-football team object the picker selected, shaped
-- { id, name, code, logo } (mirrors the lifetime user_favorite_teams.team_data
-- jsonb). team_id is the api-football team id (denormalised for quick lookups).
--
-- Existing ACCOUNT-level favourites live in the secondary "lifetime" db table
-- user_favorite_teams (keyed by iptv_username). They are copied in once via the
-- one-time admin import POST /api/football/favourite-team/import, which fans an
-- account's favourite out to every profile under that account_username. Profiles
-- created afterwards start with no favourite (the user sets one via search).
--
-- Until this migration is run the favourite-team endpoints return null / persist
-- nothing, so the rest of the Football Scores screen keeps working.

create table if not exists profile_favourite_team (
  profile_id uuid primary key,
  team_id    integer not null,
  team_data  jsonb   not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
