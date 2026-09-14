const fs = require("fs");
const path = require("path");
const { Umzug, SequelizeStorage } = require("umzug");
const sequelize = require("../config/db");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

function buildMigrator({ logger = console } = {}) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

  return new Umzug({
    migrations: files.map((file) => {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      return {
        name: file,
        path: path.join(MIGRATIONS_DIR, file),
        up: (params) => migration.up(params),
        down: migration.down ? (params) => migration.down(params) : undefined,
      };
    }),
    context: { queryInterface: sequelize.getQueryInterface(), sequelize },
    // Misma tabla que usa sequelize-cli, por compatibilidad.
    storage: new SequelizeStorage({ sequelize, tableName: "SequelizeMeta" }),
    logger,
  });
}

module.exports = { buildMigrator };
