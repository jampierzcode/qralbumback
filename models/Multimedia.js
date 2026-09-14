const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Relaciones declaradas en models/index.js
const Multimedia = sequelize.define("Multimedia", {
  type: {
    type: DataTypes.ENUM("photo", "video", "audio"),
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
  },
});

module.exports = Multimedia;
