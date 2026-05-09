-- 004_app_theme.sql
-- Stores the active app-wide theme that the admin panel can flip.
-- One row only (id=1). Client polls GET /api/app-theme on launch.
create table if not exists public.app_theme (
  id          int          primary key default 1,
  theme_key   text         not null default 'default',
  updated_at  timestamptz  not null default now(),
  constraint app_theme_singleton check (id = 1),
  constraint app_theme_key_valid check (
    theme_key in ('default','halloween','bonfire','christmas','valentines','newyear')
  )
);

insert into public.app_theme (id, theme_key)
values (1, 'default')
on conflict (id) do nothing;

-- Allowed theme_key values (enforced by client too):
--   default      → current orange/black neon, vector icons
--   halloween    → orange & blacks, pumpkin imagery
--   bonfire      → multi-coloured neon, fireworks/bonfire imagery
--   christmas    → red & white, christmas imagery
--   valentines   → pink neon, love/valentine imagery
--   newyear      → golden, fireworks/celebratory imagery
