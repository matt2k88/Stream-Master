-- Per-profile category organisation preferences.
-- One row per (profile_id, type). `order_ids` is the user-defined ordering
-- of category_ids; categories not present are appended in API order at
-- read time. `hidden_ids` is the set of category_ids the user has hidden.

create table if not exists category_prefs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('live', 'movies', 'series')),
  order_ids text[] not null default '{}',
  hidden_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (profile_id, type)
);

create index if not exists category_prefs_profile_idx
  on category_prefs (profile_id);
