const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * react-native-vlc-media-player ships its own copy of libc++_shared.so which
 * collides with the one bundled by React Native's Gradle Plugin.
 *
 * The library's own Expo plugin (withGradleTasks) tries to inject a Gradle
 * task that deletes VLC's copy at merge time, but it anchors against
 * `applyNativeModulesAppBuildGradle(project)` which no longer exists in
 * Expo SDK 54's `app/build.gradle` (autolinking moved to settings.gradle in
 * modern RN), so prebuild crashes with `mergeContents` not finding the anchor.
 *
 * Instead we append a small `android { packagingOptions { pickFirst ... } }`
 * block at the end of the file. Gradle merges `android {}` blocks, so this
 * is safe and tells AGP to keep just the first copy of `libc++_shared.so`
 * encountered (RN's), discarding VLC's.
 */
const PACKAGING_BLOCK = `
// Added by withVlcLibcppFix
android {
    packagingOptions {
        pickFirst "**/libc++_shared.so"
        pickFirst "**/libjsc.so"
    }
}
`;

const TAG = "// withVlcLibcppFix";

const withVlcLibcppFix = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(TAG)) return cfg;
    cfg.modResults.contents =
      cfg.modResults.contents.trimEnd() + "\n\n" + TAG + PACKAGING_BLOCK;
    return cfg;
  });
};

module.exports = withVlcLibcppFix;
