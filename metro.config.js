const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");

const config = getDefaultConfig(__dirname);

// Filter Replit internal paths from the additional watch folders
config.watchFolders = (config.watchFolders ?? []).filter(
  (folder) => !folder.includes(".local/state/workflow-logs")
);

config.resolver = {
  ...config.resolver,
  blockList: [
    /\.local\/state\/workflow-logs\/.*/,
    // Block server-side and non-client directories so Metro doesn't
    // accidentally try to resolve or transform them — keeps bundle smaller
    // and resolver faster.
    /\/server\/.*/,
    /\/migrations\/.*/,
    /\/docs\/.*/,
    /\/static-build\/.*/,
  ],
};

// Use more parallel transform workers to speed up production builds.
// Default is CPU count / 2; bump to a fixed 4 for the build container.
config.maxWorkers = 4;

// Target the Hermes-stable transform profile — Expo SDK 54 uses Hermes by
// default on Android and iOS.  Metro can skip several Babel passes that
// Hermes handles natively, meaningfully reducing per-file transform time.
config.transformer = {
  ...config.transformer,
  unstable_transformProfile: "hermes-stable",
  // Speed-tuned terser config: one compression pass, disable the most
  // expensive analysis steps (inline hoisting, variable reduction).
  // Bundle is ~0.5% larger but minification finishes 15-25% faster.
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

// Proxy /api/* requests through Metro (port 8081, external port 80) to Express
// (port 5000). This ensures Expo Go devices can reach the API without needing
// to connect to port 5000 directly, which is blocked on most mobile networks.
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
