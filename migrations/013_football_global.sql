-- Global kill-switch for the Live Football Scores feature.
--
-- football_global: a singleton row (id always = 1, enforced by CHECK) the admin
-- flips from an external panel. When enabled = false the entire football feature
-- is disabled for every client — the "Football Scores" button is hidden from the
-- profile/account screen and the floating tracker never shows, regardless of each
-- profile's own football_prefs.enabled setting. When enabled = true the feature
-- behaves exactly as before (per-profile prefs apply).
--
-- Until this migration is run the server defaults the flag to true (graceful
-- degradation), so the feature stays on.

create table if not exists football_global (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into football_global (id, enabled)
  values (1, true)
  on conflict (id) do nothing;
