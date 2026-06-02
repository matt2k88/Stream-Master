-- Football Centre: TV-channel links for fixtures.
-- Populated externally (admin/back office) to map a fixture to the live TV
-- channel(s) showing it. The Football Centre shows a channel badge under a
-- fixture/score; tapping it deep-links to that live channel by stream_id.
create table if not exists football_fixture_channels (
  id           bigint generated always as identity primary key,
  fixture_id   bigint not null,
  channel_name text not null,
  stream_id    text,            -- Xtream live stream_id (nullable until mapped)
  created_at   timestamptz default now()
);

create index if not exists football_fixture_channels_fixture_idx
  on football_fixture_channels (fixture_id);
