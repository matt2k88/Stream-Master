---
name: Lifetime security contract
description: User-selected identity model and externally managed Lifetime RLS constraints.
---

The user explicitly chose companion-auth customer sessions, not a service-role
key, for Lifetime database access. Never trust a username supplied by the app.

**Why:** On 2026-10-02 the user applied external Supabase security rules that
deliberately limit anonymous reads to `servers`, `service_info` and
`service_info_updates`. Customer ownership comes from the signed JWT's
`app_metadata.username`; `app_metadata.role` determines admin access. Only the
companion-auth function sets those fields after validating Xtream credentials.

**How to apply:** Preserve these external protections. All protected Lifetime
queries need a verified customer's session; shared content still requires
sign-in. Cross-account imports require an authenticated administrator.
Customer updates to Lifetime `profiles` are restricted to `iptv_user_id`,
`whatsapp_number` and `whatsapp_prompt_dismissed`; VPN updates are restricted to
`is_enabled`. Referral-code changes must use the intended authorized database
function, not a direct update or a privileged fallback. If the external auth or
function contract changes, inspect it before weakening access rules.