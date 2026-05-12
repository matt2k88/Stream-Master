// Allow the app to ship with a lower minSdkVersion than
// react-native-vlc-media-player declares (it requires API 26).
//
// Why: Fire OS 6 devices (1st-gen Fire TV 4K, ~2017) run Android 7.1
// (API 25) and otherwise reject the APK at install time with
// "Problem parsing the package" because the manifest merger refuses
// to lower the effective minSdk below VLC's declared 26.
//
// Adding `tools:overrideLibrary="com.yuanzhou.vlc"` on the <uses-sdk>
// element tells the manifest merger "I know this library asks for
// API 26+, ship it anyway". On its own this would crash on launch on
// API 25 because VLC's native code touches Android 8.0+ APIs. The
// runtime guard in `client/lib/video-player.tsx` and `PlayerScreen.tsx`
// (Platform.Version < 26 → force the Expo engine, never instantiate
// VLC) keeps those devices safe.

const { withAndroidManifest } = require("@expo/config-plugins");

const TOOLS_NS = "http://schemas.android.com/tools";
const VLC_PACKAGE = "com.yuanzhou.vlc";

const withVlcMinSdkOverride = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = TOOLS_NS;
    }

    // The manifest merger only honours `tools:overrideLibrary` when it
    // is on a <uses-sdk> element. Create one if Expo's prebuild hasn't
    // emitted it yet (it usually leaves min/target/compile SDK to
    // build.gradle), then merge our package into the existing list.
    const usesSdkArr = (manifest["uses-sdk"] = manifest["uses-sdk"] ?? [{ $: {} }]);
    const usesSdk = usesSdkArr[0];
    usesSdk.$ = usesSdk.$ ?? {};
    const existing = usesSdk.$["tools:overrideLibrary"] ?? "";
    const libs = new Set(
      existing
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    libs.add(VLC_PACKAGE);
    usesSdk.$["tools:overrideLibrary"] = Array.from(libs).join(",");

    return cfg;
  });

module.exports = withVlcMinSdkOverride;
