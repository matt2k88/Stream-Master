---
name: Guest profile persistence guards
description: How the Guest profile suppresses all per-profile server persistence in Ultra Cast.
---

# Guest profile (no server persistence)

The "Guest" profile is an in-memory-only `Profile` (id === `GUEST_PROFILE_ID` = "guest")
with no DB row. It must never trigger any per-profile API write/read.

**Rule:** every per-profile context must guard BOTH its load/refresh path AND
*every* mutation method against `activeProfile.id === GUEST_PROFILE_ID` — not just
create/load. Easy to miss the secondary mutations (clearHistory, removeOne,
updateGroup, deleteGroup, addItem, removeItem) which are still callable from UI
even when reads return empty.

**Why:** a code review found guest could still fire `/api/recently-watched DELETE`
(clearHistory) and group item mutations with `profile_id=guest` because only the
load + create paths were guarded.

**How to apply:** when adding any new per-profile feature/context, add the guest
early-return to the load effect AND each write function. Device-local-only settings
(player engine) persist via `client/lib/guest-prefs.ts` (AsyncStorage) instead.

**Device-local state that is conceptually per-profile must be KEYED by profile.**
A single global AsyncStorage key (e.g. one shared "handled fixtures" map) lets one
profile's actions suppress another profile's behaviour on the same device. Key such
maps by `profileKey = isGuest ? "guest" : profileId` (e.g.
`ultracast.matchReminders.state.v2.<profileKey>`), reload only that profile's slice
on profile change, and read the key from a ref in callbacks to avoid stale closures.
**Why:** a code review found per-fixture reminder state shared one key across all
profiles, causing cross-profile suppression.
