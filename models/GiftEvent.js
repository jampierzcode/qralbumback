const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const GiftEvent = sequelize.define(
  "GiftEvent",
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    giftId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(32), allowNull: false },
    meta: { type: DataTypes.JSON, allowNull: true },
  },
  { updatedAt: false }
);

module.exports = GiftEvent;
