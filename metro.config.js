const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");

const config = getDefaultConfig(__dirname);

// ── 1. Watch folders ──────────────────────────────────────────────────────────
// Strip Replit internal paths and the attached_assets folder (large binary
// images/videos that Metro would otherwise stat/watch on every build).
config.watchFolders = (config.watchFolders ?? []).filter(
  (folder) =>
    !folder.includes(".local/state/workflow-logs") &&
    !folder.includes("attached_assets")
);

// ── 2. Resolver ───────────────────────────────────────────────────────────────
// Packages that are server-side ONLY (Express, DB drivers, TS runner, YouTube
// extractors, etc.). Metro will never import them from client code, so we stub
// them to empty modules to avoid walking their combined ~68 MB dependency tree.
const SERVER_ONLY_PACKAGES = [
  "express",
  "pg",
  "ws",
  "tsx",
  "drizzle-orm",
  "drizzle-zod",
  "http-proxy-middleware",
  "@distube/ytdl-core",
  "youtubei.js",
  "@supabase/supabase-js", // client/lib/supabase.ts uses raw fetch — SDK never imported
];

config.resolver = {
  ...config.resolver,

  // Add 'web' so Metro applies .web.tsx / .web.ts / .web.js suffix resolution
  // when serving the web bundle (platform=web). Without this, video-player.web.tsx
  // and other web shims are never preferred over their native counterparts, causing
  // native-only imports (react-native-vlc-media-player, expo-video) to load in
  // the browser and crash.
  platforms: [...(config.resolver.platforms ?? ['ios', 'android']), 'web'],

  blockList: [
    // Replit internals
    /\.local\/state\/workflow-logs\/.*/,
    // Server-side source directories — Metro must never bundle these
    /\/server\/.*/,
    /\/migrations\/.*/,
    /\/docs\/.*/,
    /\/static-build\/.*/,
    // Large binary/media assets folder — not JS, just wastes scanner time
    /\/attached_assets\/.*/,
    // Block the node_modules trees of every server-only package.
    // This is a second line of defence on top of resolveRequest below.
    /\/node_modules\/express\/.*/,
    /\/node_modules\/pg\/.*/,
    /\/node_modules\/ws\/.*/,
    /\/node_modules\/tsx\/.*/,
    /\/node_modules\/drizzle-orm\/.*/,
    /\/node_modules\/drizzle-zod\/.*/,
    /\/node_modules\/http-proxy-middleware\/.*/,
    /\/node_modules\/@distube\/.*/,
    /\/node_modules\/youtubei\.js\/.*/,
    /\/node_modules\/@supabase\/.*/,
  ],

  // Return an empty module immediately for any server-only package so Metro
  // never walks their dependency sub-trees.
  resolveRequest: (context, moduleName, platform) => {
    for (const pkg of SERVER_ONLY_PACKAGES) {
      if (moduleName === pkg || moduleName.startsWith(pkg + "/")) {
        return { type: "empty" };
      }
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// ── 3. Workers ────────────────────────────────────────────────────────────────
// Use more parallel transform workers. Default is CPU count / 2; bump to 8
// for the production build container.
config.maxWorkers = 8;

// ── 4. Transformer ────────────────────────────────────────────────────────────
// hermes-stable lets Metro skip several Babel passes that Hermes handles
// natively.  The fast minifier config saves another 15-25% on minification.
config.transformer = {
  ...config.transformer,
  unstable_transformProfile: "hermes-stable",
  minifierConfig: {
    compress: {
      passes: 1,
      inline: 1,
      reduce_vars: false,
      reduce_funcs: false,
      sequences: 20,
    },
    mangle: {
      keep_classnames: false,
      keep_fnames: false,
      toplevel: false,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
    },
  },
};

// ── 5. Dev-server API proxy ───────────────────────────────────────────────────
// Proxy /api/* through Metro (port 8081) to Express (port 5000) so Expo Go
// devices on mobile networks can reach the API without needing port 5000.
config.server = {
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      if (req.url && req.url.startsWith("/api/")) {
        const options = {
          hostname: "localhost",
          port: 5000,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:5000" },
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on("error", (err) => {
          console.error("[Metro API proxy error]", err.message);
          if (!res.headersSent) {
            res.writeHead(502);
            res.end("Bad Gateway");
          }
        });

        req.pipe(proxyReq, { end: true });
        return;
      }

      metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;
