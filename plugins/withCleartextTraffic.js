const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>`;

const withNetworkSecurityConfig = (config) => {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(
        path.join(resDir, "network_security_config.xml"),
        networkSecurityConfig
      );
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const mainApp = cfg.modResults.manifest.application[0];
    mainApp.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    mainApp.$["android:usesCleartextTraffic"] = "true";
    return cfg;
  });

  return config;
};

module.exports = withNetworkSecurityConfig;
