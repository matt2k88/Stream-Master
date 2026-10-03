// Forward hardware media keys from the Activity into the tv-remote module.
//
// Why this exists: standard React Native (as opposed to the react-native-tvos
// fork) does not export TVEventHandler, so the media-key branches already
// written into PlayerScreen / VlcPlayerScreen / LivePreviewScreen silently did
// nothing — `require("react-native").TVEventHandler` was always undefined and
// the effect bailed on its first line. On a Fire TV remote, play/pause and the
// skip buttons therefore appeared dead.
//
// Android delivers those keys to the foreground Activity, so three lines in
// MainActivity.dispatchKeyEvent hand them to TvRemoteKeyBus, which the local
// expo module in modules/tv-remote forwards to JS.
//
// Only media keys are consumed. D-pad and everything else fall through to
// super.dispatchKeyEvent() untouched, so focus navigation is unaffected.

const { withMainActivity } = require("@expo/config-plugins");

const BEGIN = "// @ultracast-tv-remote begin";
const END = "// @ultracast-tv-remote end";

const OVERRIDE = `
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (expo.modules.tvremote.TvRemoteKeyBus.dispatchSelect(event)) {
      return true
    }
    if (event.action == android.view.KeyEvent.ACTION_DOWN &&
        expo.modules.tvremote.TvRemoteKeyBus.dispatch(event.keyCode)) {
      return true
    }
    return super.dispatchKeyEvent(event)
  }
`;

const withTvRemoteKeys = (config) =>
  withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withTvRemoteKeys expects a Kotlin MainActivity");
    }
    // Always REPLACE any previously injected block rather than skipping when
    // one exists. The old guard ("if TvRemoteKeyBus is already present, do
    // nothing") meant every later change to this plugin was silently ignored —
    // the generated MainActivity kept the first version forever, so new key
    // handling compiled into the app but was never called.
    let src = cfg.modResults.contents;
    const begin = src.indexOf(BEGIN);
    const end = src.indexOf(END);
    if (begin !== -1 && end !== -1) {
      src = src.slice(0, begin) + src.slice(end + END.length);
    } else {
      // Remove a legacy, unmarked block from before sentinels existed.
      src = src.replace(
        /\n *override fun dispatchKeyEvent\(event: android\.view\.KeyEvent\): Boolean \{[\s\S]*?\n *\}\n/,
        "\n",
      );
    }
    const lastBrace = src.lastIndexOf("}");
    if (lastBrace === -1) {
      throw new Error("withTvRemoteKeys could not find the end of MainActivity");
    }
    cfg.modResults.contents =
      src.slice(0, lastBrace) + OVERRIDE + src.slice(lastBrace);
    return cfg;
  });

module.exports = withTvRemoteKeys;
