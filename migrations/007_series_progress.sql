-- Series-level progress tracking. Two snapshots are taken at the time
-- the user plays an episode, so the dashboard can decide series-wide
-- state without re-hitting the Xtream API:
--   * series_last_modified  — `last_modified` from the Series row at save
--                             time. If the current Series.last_modified
--                             differs we know new episodes were uploaded
--                             since the user last played anything → show
--                             a "NEW EPISODES" badge and treat the series
--                             as continue-watching even if the previously
--                             watched episode was completed.
--   * series_total_episodes — total episode count across all seasons of
--                             the series at save time. Combined with the
--                             count of `is_completed=true` rows for the
--                             same series_id this lets us know whether
--                             the user has finished every episode → only
--                             then is the series rendered "WATCHED".
-- Both columns are nullable; absent values fall back to the legacy
-- single-episode `is_completed` flag for backwards compatibility.

alter table recently_watched
  add column if not exists series_last_modified text,
  add column if not exists series_total_episodes integer;
