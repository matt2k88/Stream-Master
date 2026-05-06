const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Adds Android TV / Fire TV support:
 *  - Copies a banner image into res/drawable-xhdpi/tv_banner.png
 *  - Adds android:banner="@drawable/tv_banner" to <application>
 *  - Adds <category android:name="android.intent.category.LEANBACK_LAUNCHER" /> to MAIN activity
 *  - Adds required <uses-feature> declarations so the app shows up on TV launchers
 */
const withTvBanner = (config, { bannerPath = "./assets/images/tv-banner.png" } = {}) => {
  // 1. Copy the banner png into res/drawable-xhdpi
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const drawableDir = path.join(platformRoot, "app", "src", "main", "res", "drawable-xhdpi");
      fs.mkdirSync(drawableDir, { recursive: true });
      const src = path.resolve(projectRoot, bannerPath);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(drawableDir, "tv_banner.png"));
      } else {
        console.warn(`[withTvBanner] banner not found at ${src}`);
      }
      return cfg;
    },
  ]);

  // 2. Patch AndroidManifest.xml
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return cfg;

    // android:banner
    application.$ = application.$ || {};
    application.$["android:banner"] = "@drawable/tv_banner";

    // <uses-feature> declarations (touchscreen optional, leanback optional → app installs on phones AND TVs)
    manifest["uses-feature"] = manifest["uses-feature"] || [];
    const ensureFeature = (name, required) => {
      const exists = manifest["uses-feature"].some((f) => f.$ && f.$["android:name"] === name);
      if (!exists) {
        manifest["uses-feature"].push({ $: { "android:name": name, "android:required": String(required) } });
      }
    };
    ensureFeature("android.software.leanback", false);
    ensureFeature("android.hardware.touchscreen", false);

    // Add LEANBACK_LAUNCHER category to the main activity
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    mainActivity["intent-filter"] = mainActivity["intent-filter"] || [];
    const launcherFilter = mainActivity["intent-filter"].find((f) =>
      f.action?.some((a) => a.$["android:name"] === "android.intent.action.MAIN")
    );
    if (launcherFilter) {
      launcherFilter.category = launcherFilter.category || [];
      const hasLeanback = launcherFilter.category.some(
        (c) => c.$["android:name"] === "android.intent.category.LEANBACK_LAUNCHER"
      );
      if (!hasLeanback) {
        launcherFilter.category.push({ $: { "android:name": "android.intent.category.LEANBACK_LAUNCHER" } });
      }
    }

    return cfg;
  });

  return config;
};

module.exports = withTvBanner;
