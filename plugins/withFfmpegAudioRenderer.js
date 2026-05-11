const { withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Enables FFmpeg software audio decoders (AC3 / EAC3 / DTS / MP2 / etc.)
 * inside react-native-video v6's bundled ExoPlayer (Media3).
 *
 * Why this exists: Firestick devices (and some other Android TV boxes)
 * lack licensed Dolby AC3/EAC3 hardware decoders. MediaCodec accepts the
 * audio track but produces silent output, so ExoPlayer's normal "fall
 * back to extension on init failure" path never fires. The fix is to
 * make ExoPlayer PREFER FFmpeg software decoders for audio over
 * MediaCodec — which is what every "it just works" Android IPTV app
 * (TiviMate, OTT Navigator, etc.) does internally.
 *
 * Two changes are needed and we apply both during prebuild:
 *
 * 1) Patch react-native-video's ReactExoplayerView.java to flip
 *    EXTENSION_RENDERER_MODE_OFF -> EXTENSION_RENDERER_MODE_PREFER on
 *    the DefaultRenderersFactory it constructs. The library hardcodes
 *    OFF and exposes no config knob, so we modify the file directly in
 *    node_modules. The patch is idempotent and re-runs every prebuild,
 *    so a fresh node_modules on EAS still gets patched.
 *
 * 2) Add the prebuilt FFmpeg ExoPlayer extension AAR to the app's
 *    Gradle dependencies. We use anilbeesetti's nextlib package which
 *    publishes Google's official Media3 FFmpeg extension to Maven
 *    Central at the official androidx.media3.decoder.ffmpeg.* class
 *    paths so DefaultRenderersFactory finds it via reflection without
 *    any extra wiring.
 *
 * Failure modes are graceful:
 *   - If the patch fails (e.g. rnv updates and changes the line),
 *     we log a warning, FFmpeg AAR is still bundled but unused, audio
 *     plays the same as before.
 *   - If the AAR resolution fails (version mismatch with Media3),
 *     EAS build fails loudly — bump the version below to one that
 *     matches the Media3 version in
 *     node_modules/react-native-video/android/gradle.properties.
 */

const RNV_TARGET = "node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java";
const NEEDLE = ".setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)";
const REPLACEMENT = ".setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)";

// nextlib publishes one AAR per (Media3 version, nextlib version) pair.
// Version format is "<media3Version>-<nextlibVersion>". This MUST match
// the Media3 version that react-native-video bundles
// (RNVideo_media3Version in node_modules/react-native-video/android/
// gradle.properties — currently 1.8.0). If you bump react-native-video
// and Media3 moves, find the matching build at
// https://central.sonatype.com/artifact/io.github.anilbeesetti/nextlib-media3ext
// and update this string.
const NEXTLIB_VERSION = "1.8.0-0.9.0";

const withRnvRendererPatch = (config) => {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const fp = path.join(cfg.modRequest.projectRoot, RNV_TARGET);
      if (!fs.existsSync(fp)) {
        console.warn(`[withFfmpegAudioRenderer] target not found: ${RNV_TARGET}`);
        return cfg;
      }
      const src = fs.readFileSync(fp, "utf8");
      if (src.includes(REPLACEMENT)) {
        console.log("[withFfmpegAudioRenderer] already patched (PREFER mode active)");
        return cfg;
      }
      if (!src.includes(NEEDLE)) {
        // Hard fail — if we ship without the patch, the FFmpeg AAR is
        // bundled (+10MB APK) but never used, and Firestick audio will
        // silently regress to broken. Better to fail the build loudly
        // than ship a broken APK that LOOKS fine.
        throw new Error(
          "[withFfmpegAudioRenderer] could not find the EXTENSION_RENDERER_MODE_OFF " +
          "needle in ReactExoplayerView.java. react-native-video may have changed " +
          "its player construction. Inspect " + RNV_TARGET + " around the " +
          "DefaultRenderersFactory builder and update NEEDLE/REPLACEMENT in " +
          "plugins/withFfmpegAudioRenderer.js."
        );
      }
      fs.writeFileSync(fp, src.replace(NEEDLE, REPLACEMENT), "utf8");
      console.log(
        "[withFfmpegAudioRenderer] patched ReactExoplayerView.java " +
        "(EXTENSION_RENDERER_MODE_OFF -> PREFER)"
      );
      return cfg;
    },
  ]);
};

const withFfmpegDependency = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    const dep = `implementation "io.github.anilbeesetti:nextlib-media3ext:${NEXTLIB_VERSION}"`;
    if (cfg.modResults.contents.includes("nextlib-media3ext")) {
      return cfg;
    }
    // Insert at the start of the dependencies block. Match the first
    // "dependencies {" we encounter — that's the app module's block.
    const before = cfg.modResults.contents;
    cfg.modResults.contents = before.replace(
      /dependencies\s*\{/,
      `dependencies {
    // FFmpeg software audio decoders (AC3 / EAC3 / DTS / MP2) for
    // Firestick / Android TV devices without licensed hardware decoders.
    // Loaded reflectively by ExoPlayer's DefaultRenderersFactory when
    // extension renderer mode == PREFER (set via withFfmpegAudioRenderer).
    ${dep}`
    );
    if (cfg.modResults.contents === before) {
      throw new Error(
        "[withFfmpegAudioRenderer] could not find a 'dependencies {' block " +
        "in app/build.gradle to inject the FFmpeg AAR into."
      );
    }
    console.log(`[withFfmpegAudioRenderer] added ${dep}`);
    return cfg;
  });
};

module.exports = (config) => {
  config = withRnvRendererPatch(config);
  config = withFfmpegDependency(config);
  return config;
};
