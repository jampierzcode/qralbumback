const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Quien compra. NO es un regalo y NO inicia sesión.
const Customer = sequelize.define("Customer", {
  name: { type: DataTypes.STRING(120), allowNull: false },
  phone: { type: DataTypes.STRING(32), allowNull: true },
  email: { type: DataTypes.STRING(160), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
  legacyUserId: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = Customer;
