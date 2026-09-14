const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const GiftResponse = sequelize.define("GiftResponse", {
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  giftId: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(80), allowNull: false },
  answer: { type: DataTypes.STRING(16), allowNull: false },
  guests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  message: { type: DataTypes.STRING(300), allowNull: true },
});

module.exports = GiftResponse;
