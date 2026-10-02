# Lifetime database authentication

The Lifetime database is accessed through authenticated customer sessions, not
an anonymous table client or a service-role key. The main Ultra Cast database is
separate and is not changed by this integration.

## Sign-in and session lifecycle

1. The TV app validates/stores its existing Xtream login and sends the username
   and password over HTTPS to `POST /api/lifetime-auth/login`.
2. The server calls the configured Lifetime Supabase project's `companion-auth`
   function with `action: "login"`. The function verifies the IPTV login.
3. The server verifies the returned access token with Supabase and matches the
   token's `app_metadata.username` and `app_metadata.role` to the verified user.
4. The access/refresh tokens stay encrypted inside a server-managed session
   ticket. Only this opaque ticket, its expiry and account name go to the app.
   Native storage uses SecureStore chunks; web storage uses AsyncStorage.
5. Protected app requests include the ticket as a Bearer authorization header.
   The server decrypts it, verifies its user and constructs a new Supabase client
   for that request with the customer's access token. It never signs a shared
   database client into a customer account.
6. The app refreshes expiring sessions through `/api/lifetime-auth/refresh`,
   without sending the IPTV password again. Concurrent refreshes are serialized.
   Revoked sessions return the app to sign-in; temporary network/server failures
   are not treated as a confirmed lack of entitlement.
7. Logout removes local credentials and the session ticket, and asks Supabase
   to revoke the session's refresh token. As with standard Supabase logout,
   issued access tokens can remain valid until their expiry.

Tickets have a maximum 30-day lifetime and use AES-256-GCM with a purpose-specific
key derived from the existing server-only `SESSION_SECRET`. They survive server
restarts/autoscale instance changes without a new session-storage table.
Rotating `SESSION_SECRET` invalidates existing tickets. Keep it consistent across
production instances. Do not log auth response bodies or session tickets.

Missing/invalid authentication fails closed. An app-supplied username is never
identity: filters and inserted account names use the verified JWT identity.
Conflicting legacy username fields are rejected.

## Complete connection inventory

| Lifetime table | Server routes | Operations / identity |
| --- | --- | --- |
| `lifetime_users` | `/api/lifetime-check` | Read the verified customer's status |
| `vpn_subscriptions` | `/api/vpn/status`, `/api/vpn/toggle` | Read own row; update only `is_enabled` |
| `content_requests` | `/api/content-requests` | Read own requests |
| `watchlist` | `/api/watchlist`, `/api/watchlist/:id`, `/api/profiles/:id/reset` | Read/create/update/delete own rows |
| `user_favorite_teams` | `/api/football/favourite-team/import` | Cross-account import requires a verified admin session |
| `ultra_four_competitions` | `/api/ultra-four/competitions`, prediction submission | Shared signed-in reads and competition-open check |
| `ultra_four_predictions` | `/api/ultra-four/predictions` | Read/write own predictions; supplied IDs must belong to the caller and competition |
| `profiles` | `/api/referrals`, `/api/referrals/generate` | Read own referral values; create own missing row; check generated IPTV-ID uniqueness |
| `referral_logs` | `/api/referrals/history` | Read own referral history |
| `top_picks` | `/api/top-picks` | Shared signed-in reads; cache scoped to authenticated identity |

Existing referral codes are generated through
`create_referral_code_for_user(p_username)` as the signed-in customer, not a
privileged bypass. The database function and column guard remain authoritative;
permission failures must be fixed in their intended contract, not bypassed by
giving the app unrestricted database access.

Profile reset also verifies ownership of the main-database profile before
clearing its history, favourites or the account watchlist. The old localhost /
import-secret bypass for bulk favourite-team import is no longer accepted;
use a companion-auth administrator session.

## Shipping and verification

**Both a successful server publish and a rebuilt APK are required.** Older APKs
send usernames but no authenticated ticket, so their protected Lifetime requests
receive 401. Publish the server with the existing Lifetime URL, anonymous key and
`SESSION_SECRET` before distributing the rebuilt app. No service-role key or
database policy changes are required.

Regression tests (synthetic sessions; no live data writes):

```sh
npx tsx --test server/lifetime-auth.test.ts client/lib/lifetime-session.test.ts
```

The tests cover unauthenticated access, username spoofing, encrypted-ticket
tampering, request isolation, refresh, logout, native secure-storage chunking and
account switching. Browser verification used simulated accounts; verify the real
companion-auth contract, referral function and TV device flow with an authorized
test account before distribution.