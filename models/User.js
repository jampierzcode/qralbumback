const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define("User", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM("superadmin", "cliente"),
    defaultValue: "cliente",
  },
  uuid: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true, // Solo se asigna si es un cliente
  },
});

module.exports = User;
