---
name: Football Centre "Upcoming" fixture window strategy
description: Why Upcoming uses a rolling day-window PLUS full-season tournament pulls, and the gotchas
---

# Football Centre Upcoming fixture window

The Football Centre "Upcoming" list is built server-side by a daily refresh that
does TWO things and merges them:

1. **Rolling window** — the next N days (`FIXTURES_DAYS_AHEAD`, currently 7), one
   `/fixtures?date=` request per day, filtered to the curated leagues.
2. **Full-season tournaments** — for each entry in `FULL_SEASON_COMPETITIONS`
   (e.g. FIFA World Cup = api-football league `1`, season `2026`), the ENTIRE
   season is pulled in a single `/fixtures?league=&season=` request.

**Why both:** a rolling day-window alone truncates any tournament that runs weeks
beyond the window — that's why the World Cup "stopped" mid-tournament. The
full-season pull shows the whole bracket; the day-window still covers all the
other curated leagues cheaply.

**How to apply / invariants:**
- **Dedupe by `fixture_id` in a Map** before upserting. The day-scan and the
  season-pull overlap during the tournament, and Postgres rejects an upsert whose
  payload contains the same conflict key twice.
- **Derive `date_key` from the real kickoff** (timestamp, else the ISO `fixture.date`).
  If a fixture has NO real date (TBD/unscheduled knockout rounds), **skip it** —
  never invent `date_key = today`, or it pins to the top of Upcoming forever and
  never gets purged by `purgePastFixtures()`.
- A `FULL_SEASON_COMPETITIONS` league MUST also be in `CURATED_LEAGUE_IDS`, or the
  `CURATED_SET` gate silently drops every one of its fixtures (there's a startup
  warn log for this).

**Data-source gotcha (not a bug):** api-football only exposes a tournament's
group-stage dates until teams qualify; knockout fixtures are absent/TBD. So the
World Cup correctly shows only the 72 group games until later rounds are scheduled
— the daily full-season re-pull picks them up automatically as they appear.
