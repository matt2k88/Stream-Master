---
name: Football credential boundary
description: Database lockdown requires football credentials to remain server-only without an APK migration.
---

Customers must not obtain football API credentials from the Ultra Cast settings table or app responses.

**Why:** The user is locking down the database because customers can currently read API keys from settings. They explicitly required this migration to work with existing APKs, without an app rebuild.

**How to apply:** Keep the football credential in server Secrets, preserve existing client API contracts, and never introduce a settings-table credential fallback or a public/client environment variable. Check the published server before declaring that the database lockdown can proceed; preparing workspace code is not proof that production has been updated.