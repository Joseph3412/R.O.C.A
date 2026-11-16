const { withSettingsGradle } = require("@expo/config-plugins");

module.exports = (config) =>
  withSettingsGradle(config, (modConfig) => {
    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      /rootProject\.name\s*=\s*['"][^'"]*['"]/,
      "rootProject.name = 'ROCA'",
    );
    return modConfig;
  });
