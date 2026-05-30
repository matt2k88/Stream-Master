-- Live Football: goal-scorer announcements.
--
-- Adds the most-recent goal event to each football_scores row so the floating
-- tracker can show a "GOAL!" announcement line (with the scorer's name and
-- minute) below the scores ticker.
--
-- The server only calls api-football `/fixtures/events` when it detects a
-- fixture's total score has increased — at most one extra request per scoring
-- fixture per poll (not per poll for all games) — so this stays well within
-- quota.
--
-- These columns are optional: the score cache and the client-side GOAL flash
-- both work without them; only the scorer name needs this migration.
alter table football_scores
  add column if not exists last_goal_player text,
  add column if not exists last_goal_team text,
  add column if not exists last_goal_minute integer,
  add column if not exists last_goal_at timestamptz;
