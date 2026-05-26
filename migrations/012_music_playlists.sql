-- Music feature tables
-- Spotify-like music player powered by iTunes Search (catalog) +
-- YouTube IFrame (playback). All tables are profile-scoped.

create table if not exists music_playlists (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists music_playlists_profile_idx
  on music_playlists (profile_id, updated_at desc);

create table if not exists music_playlist_tracks (
  id              uuid primary key default gen_random_uuid(),
  playlist_id     uuid not null references music_playlists(id) on delete cascade,
  position        integer not null default 0,
  itunes_track_id text not null,
  title           text not null,
  artist          text not null,
  album           text,
  artwork_url     text,
  duration_sec    integer,
  added_at        timestamptz not null default now()
);

create index if not exists music_playlist_tracks_playlist_idx
  on music_playlist_tracks (playlist_id, position asc);

-- Global cache of iTunes-track-id → YouTube video-id resolutions so we
-- never resolve the same song twice. Shared across all users.
create table if not exists music_resolved_tracks (
  itunes_track_id text primary key,
  video_id        text not null,
  channel         text,
  title           text,
  resolved_at     timestamptz not null default now()
);
