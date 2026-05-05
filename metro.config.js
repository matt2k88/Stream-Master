const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude Replit internal paths that Metro should not watch
config.watchFolders = (config.watchFolders ?? []).filter(
  (folder) => !folder.includes(".local/state/workflow-logs")
);

config.resolver = {
  ...config.resolver,
  blockList: [
    /\.local\/state\/workflow-logs\/.*/,
  ],
};

module.exports = config;
