-- Live Football: team badges/logos on live scores.
--
-- Adds the home/away team logo URLs to each football_scores row so the Football
-- Centre (and any score UI) can show the team badge to the left of the name.
-- The poller already receives these from api-football (teams.home.logo /
-- teams.away.logo) — this just gives them a place to live.
--
-- These columns are optional: the live score cache works without them (the
-- poller upserts without logos as a fallback until this migration is run, and
-- the UI simply shows no badge). The Upcoming tab already has logos via
-- football_fixtures (migration 015).
alter table football_scores
  add column if not exists home_logo text,
  add column if not exists away_logo text;
