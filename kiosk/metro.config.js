// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The clock-in rules the server applies (../shared/src/kiosk) and the academy's time zone helpers, imported as
// @shared/...: one implementation for the website, the server and the tablet.
config.watchFolders = [path.resolve(__dirname, "../shared")];

module.exports = config;
