---
name: Stream enricher lessons
description: Why the stream_ratings enricher was stuck at 1349 entries and what fixed it
---

## Root causes (all fixed)

1. **Supabase 1000-row default limit** — `fetchAllStreamRatings` without `.range()` silently caps at 1000 rows. Use paginated fetch with `.range(from, from+PAGE-1)` loop for any bulk query.

2. **Per-item DB lookup is catastrophic at scale** — `getStreamRating()` per item at 250ms/call × 36994 items = 2.5 hours just for skip checks. Always preload into a `Set<string>` at the start of any bulk enricher.

3. **IPTV stream names have provider prefixes** — patterns like `"UK | The Dark Knight"`, `"AR | Avengers"`, `"TUR | Series Name"`, `"Movie |FHD"` must be stripped before TMDB search. `parseName()` now strips these.

4. **Regex must use precise boundaries for quality tags** — naive `/ENG/gi` strips "eng" from within "Avengers". Use bracketed/pipe/trailing-only patterns, not global substring replace.

5. **IPTV providers mis-classify TV shows as VOD movies** — always try cross-type fallback: if `/search/movie` returns nothing, retry with `/search/tv`, and vice versa.

**Why:** Without these fixes the enricher appeared to run (skipped: 1840+) but never wrote new rows. Processed counter stayed at 0.

**How to apply:** Any future enricher touching stream_ratings must: preload rated set, clean names, do cross-type search fallback.
