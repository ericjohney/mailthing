const withPlugins = require("next-compose-plugins");
const css = require("@zeit/next-css");
const typescript = require("@zeit/next-typescript");

function getEnvOrDefault(property, defaultValue) {
  return process.env[property] || defaultValue;
}
function getEnv(property) {
  return process.env[property];
}

module.exports = withPlugins([[css], [typescript]], {
  serverRuntimeConfig: {
    sqliteDatabase: getEnvOrDefault("SQLITE_DB", ":memory:"),
    emailOverride: getEnv("EMAIL_OVERRIDE")
  },
  publicRuntimeConfig: {}
});
