-- Football Centre: TV-channel links for fixtures.
-- Populated externally (admin/back office) to map a fixture to the live TV
-- channel showing it. The Football Centre shows a channel badge under a
-- fixture/score; tapping it deep-links to that live channel by stream_id.
-- One row per fixture (fixture_id is PK + FK into football_fixtures).
create table if not exists football_fixture_channels (
  fixture_id   bigint primary key references football_fixtures (fixture_id) on delete cascade,
  channel_name text not null,
  stream_id    text,            -- Xtream live stream_id (nullable until mapped)
  updated_at   timestamptz default now()
);
