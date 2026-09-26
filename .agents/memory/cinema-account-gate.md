---
name: Cinema account gate
description: Security boundaries for account-gated Cinema Releases and resume history.
---

Cinema Releases must verify the signed-in IPTV credentials against a configured provider on the server before checking the main database's account list and returning uploads. Client-provided usernames or profile IDs alone are not proof of identity.

**Why:** The app's Xtream login is client-side, and legacy profile-scoped history endpoints do not verify account ownership. Persisting uploaded MP4 links in that history would let callers retrieve links through an unrelated, weaker endpoint.

**How to apply:** Keep the catalogue behind provider verification. Use the upload UUID as a distinct history identity, but save only playback progress, title and cover in history; resolve playback links from the currently authorized catalogue. If the storage itself must be protected against copied URLs, separately secure the media host and the database's direct access rules rather than relying on the in-app category gate.