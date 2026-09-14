const { Sequelize } = require("sequelize");
const { db } = require("./config");

const sequelize = new Sequelize(db.database, db.user, db.password, {
  host: db.host,
  port: db.port,
  dialect: "mysql",
  logging: false,
});

module.exports = sequelize;
