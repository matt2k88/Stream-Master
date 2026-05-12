-- Snapshots of the FINAL available episode (highest season → highest
-- episode in that season) at the moment the user played an episode of a
-- series. Combined with `series_last_modified` (added in 007) the
-- dashboard decides:
--   * If the user has a `recently_watched` row for the series with
--     `is_completed=true` matching `series_final_season` /
--     `series_final_episode` → the series is WATCHED (regardless of any
--     earlier episodes they may have skipped).
--   * If the current `Series.last_modified` differs from the snapshot
--     stored on the latest row → new content has dropped since they
--     last played anything, the series flips back to CONTINUE WATCHING
--     with a "NEW EPISODES" badge, and a fresh play will record the
--     new final-episode coordinates.
-- Both columns are nullable so legacy rows (and rows saved before the
-- prefetch effect populated the snapshot) keep working — they just
-- won't trigger the WATCHED state until a fresh play records them.

alter table recently_watched
  add column if not exists series_final_season integer,
  add column if not exists series_final_episode integer;
