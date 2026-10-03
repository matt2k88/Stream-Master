// Forward hardware keys from the Activity into the tv-remote module.
//
// Why this exists: standard React Native (as opposed to the react-native-tvos
// fork) does not export TVEventHandler, so the media-key branches already
// written into PlayerScreen / VlcPlayerScreen / LivePreviewScreen silently did
// nothing. And `onLongPress` rides React Native's touch system, which a remote
// never produces, so "hold OK to favourite" could not work either.
//
// Android delivers these keys to the foreground Activity, so the override below
// hands them to TvRemoteKeyBus, which the local expo module in modules/tv-remote
// forwards to JS.
//
// TWO RULES, both learned the hard way:
//
// 1. REPLACE the injected block every run; never skip because one is already
//    there. An earlier version bailed out when it found its own marker, so once
//    the first version had been injected, every later change to this plugin was
//    silently discarded — prebuild ran, the plugin ran, kept the stale code, and
//    nothing failed or logged to show it.
//
// 2. Remove the old block by COUNTING BRACES, not with a regex. A non-greedy
//    regex stopped at the first closing brace (the end of the first `if`), so it
//    deleted the signature and left the body behind, producing a Kotlin file
//    that would not compile.

const { withMainActivity } = require("@expo/config-plugins");

const BEGIN = "// @ultracast-tv-remote begin";
const END = "// @ultracast-tv-remote end";

const OVERRIDE = `
  ${BEGIN}
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    // Held OK first: it consumes the key-up so a long press does not also
    // register as a normal press.
    if (expo.modules.tvremote.TvRemoteKeyBus.dispatchSelect(event)) {
      return true
    }
    if (event.action == android.view.KeyEvent.ACTION_DOWN &&
        expo.modules.tvremote.TvRemoteKeyBus.dispatch(event.keyCode)) {
      return true
    }
    return super.dispatchKeyEvent(event)
  }
  ${END}
`;

/** Removes a previously injected override: between the sentinels when present, otherwise by brace matching. */
function stripExisting(src) {
  const begin = src.indexOf(BEGIN);
  const end = src.indexOf(END);
  if (begin !== -1 && end !== -1 && end > begin) {
    return src.slice(0, begin) + src.slice(end + END.length);
  }

  const sig = src.indexOf("override fun dispatchKeyEvent");
  if (sig === -1) return src;
  const open = src.indexOf("{", sig);
  if (open === -1) return src;

  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(0, sig) + src.slice(i + 1);
    }
  }
  return src;
}

const withTvRemoteKeys = (config) =>
  withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withTvRemoteKeys expects a Kotlin MainActivity");
    }

    const src = stripExisting(cfg.modResults.contents);
    const lastBrace = src.lastIndexOf("}");
    if (lastBrace === -1) {
      throw new Error("withTvRemoteKeys could not find the end of MainActivity");
    }

    cfg.modResults.contents = src.slice(0, lastBrace) + OVERRIDE + src.slice(lastBrace);
    return cfg;
  });

module.exports = withTvRemoteKeys;
