function getEnvOrDefault(property, defaultValue) {
  return process.env[property] || defaultValue;
}
function getEnv(property) {
  return process.env[property];
}

module.exports = {
  poweredByHeader: false,
  serverRuntimeConfig: {
    sqliteDatabase: getEnvOrDefault("SQLITE_DB", ":memory:"),
    emailOverride: getEnv("EMAIL_OVERRIDE")
  },
  publicRuntimeConfig: {}
};
