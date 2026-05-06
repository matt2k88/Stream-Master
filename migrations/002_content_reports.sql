-- Content reports table
create table if not exists content_reports (
  id          uuid primary key default gen_random_uuid(),
  profile_id  text not null,
  stream_id   text,
  stream_name text,
  stream_type text,
  reason      text not null,
  other_text  text,
  created_at  timestamptz not null default now()
);

create index if not exists content_reports_profile_idx on content_reports (profile_id);
create index if not exists content_reports_created_idx on content_reports (created_at desc);
