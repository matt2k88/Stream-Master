---
name: Football kill-switch scope
description: The football_global kill-switch is client-side only — it must NOT gate the server score poller or Football Centre data.
---

# Football global kill-switch scope

`football_global.enabled` (the admin kill-switch) controls ONLY the in-player
GOAL-alert / Live Football Scores tracker overlay, and that is enforced
client-side (FootballContext exposes it as `n`, consumed by HomeScreen /
LivePreviewScreen / AccountInfoScreen).

**Rule:** the server-side football poller and all Football Centre data paths must
NOT be gated by this switch — the score cache (`football_scores`), upcoming
fixtures, and fixture detail must keep updating regardless of its value.

**Why:** gating `pollOnce()` / `refreshUpcomingFixtures()` / `fetchFixtureDetail()`
on the switch froze the entire Football Centre (scores went stale) whenever an
admin flipped the switch off. The user requires the scores table to update
constantly even when the switch is off.

**How to apply:** keep `server/football.ts` poller free of any
`isGloballyEnabled` gate. The switch is read only by the `GET /api/football/global`
route for the client. There is no PUT route — the flag is toggled directly in
Supabase (admin-only). On the client, only the in-player tracker overlay and its
settings tile should be gated by `globalEnabled`; the Football Centre entry
button must stay visible regardless, or users can't see the updating scores.

**Also note:** the poller backs off to a 5-min idle interval when `pollOnce`
returns 0 (no live games / error), and polls every 60s when games are live —
so a freshly-changed condition can take up to one idle interval to take effect.
