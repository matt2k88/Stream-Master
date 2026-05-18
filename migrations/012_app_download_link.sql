-- App direct-download link for the in-app updater.
-- Singleton-ish: latest row by updated_at is used. Insert/update from the
-- admin panel whenever a new APK build is uploaded.
create table if not exists public.app_download_link (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  updated_at timestamptz not null default now()
);
