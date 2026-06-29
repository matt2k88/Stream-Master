---
name: TMDB API key type
description: TMDB has two credential types; v3 API key is more reliable than v4 JWT Bearer token for server-side enrichment.
---

## Rule
Always prefer the TMDB v3 API key (`TMDB_API_KEY`, 32-char alphanumeric) over the v4 Read Access Token (`TMDB_READ_TOKEN`, JWT). Use it as a query parameter: `?api_key={key}`.

The `tmdbFetch()` helper in `server/ratings.ts` already prefers `TMDB_API_KEY` over `TMDB_READ_TOKEN` — keep this precedence.

**Why:** v4 JWT tokens can be silently revoked by TMDB (e.g. if the underlying API application is regenerated or suspended) while appearing valid on the TMDB settings page. The v3 key uses a different auth path (`?api_key=`) and is independently testable. Both keys are on the same TMDB settings page (themoviedb.org/settings/api): the short alphanumeric one is v3, the long `eyJ...` JWT is v4.

**How to apply:** When TMDB returns 401 despite the user saying the key is correct, check the JWT `nbf` (creation date) — if it matches an old date, the token wasn't updated. Suggest using the v3 key instead. The `/api/test-tmdb` diagnostic endpoint (add temporarily to routes.ts) can test both methods in one call.
