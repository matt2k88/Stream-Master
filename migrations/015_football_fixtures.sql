-- Football Centre: upcoming fixtures cache.
-- The server poller fetches the next ~7 days of fixtures once per day
-- (one /fixtures?date=YYYY-MM-DD request per day, filtered to curated leagues)
-- and upserts them here. Clients read this cache and never call api-football.
create table if not exists football_fixtures (
  fixture_id      bigint primary key,
  league_id       int not null,
  league_name     text,
  league_country  text,
  home_team       text,
  away_team       text,
  home_logo       text,
  away_logo       text,
  kickoff         timestamptz,
  date_key        text,          -- YYYY-MM-DD (kickoff date, UTC) for day grouping
  status_short    text,
  updated_at      timestamptz default now()
);

create index if not exists football_fixtures_kickoff_idx on football_fixtures (kickoff);
create index if not exists football_fixtures_date_key_idx on football_fixtures (date_key);
create index if not exists football_fixtures_league_idx on football_fixtures (league_id);
