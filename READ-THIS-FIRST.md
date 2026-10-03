# One file: plugins/withTvRemoteKeys.js

Copy it in, overwriting. Nothing else changes — no version bump, no dependencies.

**This replaces the copy in the previous handoff, which has a bug.** The version you applied works on a
first build but corrupts `MainActivity.kt` on any later prebuild, and the build then fails with:

    Modifier 'override' is not applicable to 'top level function'

## What was wrong

The plugin injects a `dispatchKeyEvent` override into `MainActivity.kt`. Before re-injecting it has to
remove the previous one, and it did that with a regex:

    /\n *override fun dispatchKeyEvent\([\s\S]*?\n *\}\n/

That match is non-greedy, so it stopped at the FIRST closing brace — the end of the first `if` block —
removing the function signature and leaving its body behind as loose statements. The next injection then
added a second, valid function after the orphaned code, and Kotlin would not compile it.

The sentinel comments it was supposed to write were also missing from the injected block, so the "remove
between sentinels" path could never run and it always fell through to that regex.

## What it does now

- Writes `// @ultracast-tv-remote begin/end` around the injected block
- Removes the old block between those sentinels, or — for a block injected before sentinels existed — by
  **counting braces** to find the function's real end
- Always REPLACES, never skips. (The original version skipped when it saw its own marker, which silently
  discarded every later change to this plugin.)

## Verifying

After a build, the generated file should contain exactly one override, fenced:

    grep -c 'override fun dispatchKeyEvent' android/app/src/main/java/com/iptv/player/MainActivity.kt   # 1

Running `npx expo prebuild --platform android` repeatedly must keep that count at 1 and leave the braces
balanced. Tested here across three runs plus a clean template, and from a corrupted file.
