-- Per-profile setting: how many scorelines the floating tracker shows at once
-- before it auto-scrolls. Defaults to 5 (the previous hard-coded value); users
-- can pick 1–6. The CHECK keeps it in range.
--
-- Until this migration is run the server/client default to 5, and pref saves
-- still work (visible_lines is written via a separate guarded update so a
-- missing column never blocks the core upsert).

alter table football_prefs
  add column if not exists visible_lines integer not null default 5
    check (visible_lines between 1 and 6);
