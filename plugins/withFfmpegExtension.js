// Expo config plugin: enable the FFmpeg software-decoder extension for the
// Media3 / ExoPlayer engine inside react-native-video.
//
// Why this exists:
//   react-native-video v6 hard-codes `EXTENSION_RENDERER_MODE_OFF` in
//   ReactExoplayerView.java, which means even if FFmpeg decoders are present
//   in the APK they will never be loaded. There is currently no build flag
//   in the library to change that. This plugin:
//
//     1. Patches that one line in node_modules at prebuild time so the
//        ExoPlayer renderer factory uses EXTENSION_RENDERER_MODE_PREFER
//        (extension decoders are tried before the platform/MediaCodec ones).
//
//     2. Adds the prebuilt FFmpeg extension for Media3 published by
//        anilbeesetti (https://github.com/anilbeesetti/nextlib) to the
//        app's build.gradle dependencies. That artifact ships software
//        decoders for AC3, EAC3, DTS, MPEG-2 audio, MP1/2/3, Opus,
//        FLAC, Vorbis and a handful of other codecs that the stock
//        ExoPlayer build refuses to decode — exactly the codecs that
//        commonly break IPTV streams (especially UK/EU live TV which
//        uses AC3/EAC3 audio and the occasional MPEG-2 SD channel).
//
//   The patch runs every prebuild, so a fresh `npm install` followed by
//   `expo prebuild` will always re-apply it. Idempotent — safe to re-run.
//
// Bumping versions:
//   `nextlib-media3ext` releases track Media3 versions. If
//   react-native-video upgrades Media3 in a future release, bump the
//   FFMPEG_EXT_VERSION constant below to the matching nextlib release.
//   The version installed at the time of writing is Media3 1.8.0, paired
//   with nextlib-media3ext 0.9.1.

const { withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const FFMPEG_EXT_VERSION = "0.9.1";
const FFMPEG_EXT_COORD = `io.github.anilbeesetti.nextlib:nextlib-media3ext:${FFMPEG_EXT_VERSION}`;

const RNV_VIEW_REL_PATH = path.join(
  "react-native-video",
  "android",
  "src",
  "main",
  "java",
  "com",
  "brentvatne",
  "exoplayer",
  "ReactExoplayerView.java",
);

const PATCH_MARKER = "// [ffmpeg-extension-plugin] mode=PREFER";

function patchRendererMode(projectRoot) {
  const filePath = path.join(projectRoot, "node_modules", RNV_VIEW_REL_PATH);
  if (!fs.existsSync(filePath)) {
    console.warn(
      `[withFfmpegExtension] react-native-video source not found at ${filePath} — skipping renderer-mode patch.`,
    );
    return;
  }
  const before = fs.readFileSync(filePath, "utf8");
  if (before.includes(PATCH_MARKER)) {
    return; // already patched
  }
  if (!before.includes("EXTENSION_RENDERER_MODE_OFF")) {
    console.warn(
      `[withFfmpegExtension] EXTENSION_RENDERER_MODE_OFF not found in ${filePath}. The library may have been updated; renderer-mode patch was NOT applied. Verify FFmpeg decoders are still being loaded.`,
    );
    return;
  }
  const after = before.replace(
    /\.setExtensionRendererMode\(\s*DefaultRenderersFactory\.EXTENSION_RENDERER_MODE_OFF\s*\)/,
    `.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER) ${PATCH_MARKER}`,
  );
  if (after === before) {
    console.warn(
      `[withFfmpegExtension] Pattern matched but replacement produced no change — patch NOT applied.`,
    );
    return;
  }
  fs.writeFileSync(filePath, after, "utf8");
  console.log(
    `[withFfmpegExtension] Patched ReactExoplayerView.java → EXTENSION_RENDERER_MODE_PREFER`,
  );
}

const withFfmpegExtension = (config) => {
  // 1) Patch react-native-video's source so the extension renderer mode is
  //    PREFER instead of OFF. Runs at prebuild — before gradle picks it up.
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      patchRendererMode(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  // 2) Add the FFmpeg extension dependency to the app's build.gradle.
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("nextlib-media3ext")) {
      return cfg; // already added
    }
    const dependenciesBlockRegex = /dependencies\s*\{/;
    if (!dependenciesBlockRegex.test(cfg.modResults.contents)) {
      console.warn(
        "[withFfmpegExtension] No `dependencies {` block found in app/build.gradle — FFmpeg dep NOT added.",
      );
      return cfg;
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      dependenciesBlockRegex,
      `dependencies {\n    // Added by withFfmpegExtension — enables AC3/EAC3/DTS/MPEG-2/Opus/FLAC etc.\n    implementation "${FFMPEG_EXT_COORD}"\n`,
    );
    return cfg;
  });

  return config;
};

module.exports = withFfmpegExtension;
