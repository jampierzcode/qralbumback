const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const GIFT_STATUSES = ["draft", "collecting_content", "ready", "published", "archived"];

const Gift = sequelize.define("Gift", {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  slug: { type: DataTypes.STRING(16), allowNull: false, unique: true },
  customerId: { type: DataTypes.INTEGER, allowNull: true },
  templateId: { type: DataTypes.STRING(64), allowNull: false },
  templateVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  status: { type: DataTypes.ENUM(...GIFT_STATUSES), allowNull: false, defaultValue: "draft" },
  recipientName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
  senderName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
  occasion: { type: DataTypes.STRING(64), allowNull: true },
  content: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  settings: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  legacyUuid: { type: DataTypes.STRING(64), allowNull: true },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
});

module.exports = Gift;
module.exports.GIFT_STATUSES = GIFT_STATUSES;
