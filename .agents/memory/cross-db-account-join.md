---
name: Cross-DB account/profile join key
description: How the main db and the secondary "lifetime" db are linked for account-level data.
---

The main Supabase and the secondary "lifetime" Supabase are joined by the IPTV
account username:

- main db `profiles.account_username`  ==  lifetime db `<table>.iptv_username`

This same username is the Xtream login used everywhere (watchlist, content
requests, referrals, `user_favorite_teams`). It is **account-level**, so one
account maps to MANY profiles in the main db.

**Why:** lifetime-db features (favourites, referrals) are keyed per ACCOUNT, but
the main app's per-user data is keyed per PROFILE. Any time you import/fan
account-level lifetime data into the main db you must fan one lifetime row out to
every profile sharing that `account_username`.

**How to apply:** when bridging the two DBs, group lifetime rows by
`iptv_username`, then match against `profiles.account_username` and write one row
per profile. Make such imports idempotent (skip profiles that already have the
target row) so they are safe to re-run.
