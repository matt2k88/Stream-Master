-- Per-profile custom groups (user-defined collections of live channels,
-- movies or series). One `user_groups` row per group; one
-- `user_group_items` row per stream added to a group. Groups are scoped
-- by `type` so a "Sports" group in Live TV is independent from a
-- "Sports" group in Movies.

create table if not exists user_groups (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  type        text not null check (type in ('live', 'movies', 'series')),
  name        text not null,
  icon_key    text not null default 'folder',
  color       text not null default '#FF6600',
  created_at  timestamptz not null default now()
);

create index if not exists user_groups_profile_type_idx
  on user_groups (profile_id, type, created_at);

create table if not exists user_group_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references user_groups(id) on delete cascade,
  stream_id   bigint not null,
  stream_name text not null,
  stream_icon text,
  category_id text,
  created_at  timestamptz not null default now(),
  unique (group_id, stream_id)
);

create index if not exists user_group_items_group_idx
  on user_group_items (group_id, created_at);
