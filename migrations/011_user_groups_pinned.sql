-- Adds a `pinned` flag to user_groups. When true, the group is surfaced
-- as a category in the user's Live / Movies / Series sidebar
-- (ContentListScreen) using the group's chosen accent colour, so the
-- user can jump straight to their custom collection without opening the
-- My Groups screen.
alter table user_groups
  add column if not exists pinned boolean not null default false;

create index if not exists user_groups_profile_pinned_idx
  on user_groups (profile_id, type, pinned);
