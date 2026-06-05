-- Per-profile match-notification on/off preference.
--
-- Adds reminders_enabled to profile_favourite_team so the toggle follows the
-- profile across devices. The per-fixture "already shown" dedupe state stays
-- device-local in AsyncStorage (it tracks what was shown on this device).
--
-- The Match Notifications toggle is only usable once a favourite team is set,
-- so the profile_favourite_team row always exists before this flag is written.
--
-- Until this migration is run, GET /api/football/match-reminders returns
-- { enabled: false } and the PUT is a no-op, so the rest of the app keeps
-- working.

alter table profile_favourite_team
  add column if not exists reminders_enabled boolean not null default false;
