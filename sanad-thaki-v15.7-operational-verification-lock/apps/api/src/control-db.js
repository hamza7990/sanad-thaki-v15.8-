const { Pool } = require("pg");
const { loadConfig } = require("./config");

const config = loadConfig();

const controlPool = new Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.CONTROL_DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "sanad-control-db"
});

module.exports = { controlPool };
