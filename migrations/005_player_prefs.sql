-- Per-profile video player engine preferences.
-- Each profile picks a preferred player for VOD (movies/series) and
-- live TV independently. VLC handles AC3/EAC3 + exotic MPEG-TS that
-- expo-video can't, but expo-video plays a few HLS streams more
-- reliably than VLC. Letting users pick per category keeps both.
--
-- Allowed values: 'vlc' (react-native-vlc-media-player) or
-- 'expo' (expo-video / Media3). Default is 'vlc' for both.

alter table profiles
  add column if not exists player_vod  text not null default 'vlc',
  add column if not exists player_live text not null default 'vlc';

-- Enforce the two valid engines. Drop & re-add so re-running is safe.
alter table profiles drop constraint if exists profiles_player_vod_check;
alter table profiles drop constraint if exists profiles_player_live_check;
alter table profiles
  add constraint profiles_player_vod_check  check (player_vod  in ('vlc', 'expo')),
  add constraint profiles_player_live_check check (player_live in ('vlc', 'expo'));
