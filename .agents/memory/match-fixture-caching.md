---
name: Match-reminder fixture caching strategy
description: How/where the favourite-team fixture schedule is fetched and cached, and why
---

# Match-reminder fixture caching

The favourite-team fixture **schedule** is *team* data, not per-profile data — the
same team's fixtures are identical for every fan. So it is cached **keyed by
team_id**, never per profile. Do NOT store fixtures in the DB per profile (that
duplicates the same rows across every fan of that team).

Layers:
- Server: per-team in-memory cache (api-football `/fixtures?team=X&next=10`).
- Client: on-device AsyncStorage cache (team fixtures keyed by team_id; curated
  centre fixtures + channel map stored globally). Hydrated on launch so reminders
  fire instantly/offline, then refetched only if stale.

**Why no per-poll network:** the call returns the next ~10 fixtures (many days),
and the 15-min countdown is evaluated locally by the engine tick — so the schedule
only needs an occasional refresh (staleness window ~12h), not polling.

**How to apply / invariants:**
- Refresh is gated by a staleness window; mark "fresh" (advance the timestamp)
  ONLY when *every* part of the snapshot loaded (team fixtures + both centre
  requests). A partial failure must leave it stale so the next resume/interval
  retries — otherwise one failed sub-request is suppressed for a whole window.
- Hydrating cache as "fresh" requires BOTH team and centre caches present; gate on
  the older timestamp so a partial cache still triggers a refresh.
- A server DB cache keyed by team_id (not profile) is the right *future* scaling
  step (survives restarts, shared across users) — only worth it if api-football
  quota actually gets squeezed; it does NOT fix the cold-start/offline gap.
