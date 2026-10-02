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

const MARKER = "TvRemoteKeyBus";

const OVERRIDE = `
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
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
    if (cfg.modResults.contents.includes(MARKER)) return cfg;

    // Insert before the final closing brace of the class.
    const src = cfg.modResults.contents;
    const lastBrace = src.lastIndexOf("}");
    if (lastBrace === -1) {
      throw new Error("withTvRemoteKeys could not find the end of MainActivity");
    }
    cfg.modResults.contents =
      src.slice(0, lastBrace) + OVERRIDE + src.slice(lastBrace);
    return cfg;
  });

module.exports = withTvRemoteKeys;
