const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Con qué le pagan a un vendedor: Yape, Plin, BIM o transferencia.
const PAYMENT_TYPES = ["yape", "plin", "bim", "transfer"];

const PaymentMethod = sequelize.define("PaymentMethod", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.ENUM(...PAYMENT_TYPES), allowNull: false },
  holder: { type: DataTypes.STRING(120), allowNull: true },
  reference: { type: DataTypes.STRING(120), allowNull: false },
  bank: { type: DataTypes.STRING(80), allowNull: true },
  notes: { type: DataTypes.STRING(200), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

module.exports = PaymentMethod;
module.exports.PAYMENT_TYPES = PAYMENT_TYPES;
