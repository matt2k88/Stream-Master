-- Persist the user's last-selected audio + subtitle track per stream so
-- the player restores them next time the same movie / episode is opened.
-- Both columns are nullable: -1 means "Off" (subtitles), NULL means "no
-- preference saved yet" (player picks the libvlc default).

alter table recently_watched
  add column if not exists audio_track integer,
  add column if not exists text_track  integer;
