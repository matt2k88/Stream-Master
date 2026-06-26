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
