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
  createdById: { type: DataTypes.INTEGER, allowNull: true },
  // Revisión del regalo de un referido antes de poder compartirlo.
  reviewStatus: { type: DataTypes.ENUM("none", "pending", "approved", "rejected"), allowNull: false, defaultValue: "none" },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedById: { type: DataTypes.INTEGER, allowNull: true },
  reviewNote: { type: DataTypes.STRING(300), allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  // Lo que el vendedor le cobró a su cliente (opcional).
  salePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "PEN" },
  paidAt: { type: DataTypes.DATE, allowNull: true },
  paymentProofAssetId: { type: DataTypes.UUID, allowNull: true },
  // Pedido hecho desde la tienda pública del vendedor.
  requestStatus: { type: DataTypes.ENUM("none", "draft", "pending", "accepted", "rejected"), allowNull: false, defaultValue: "none" },
  requesterName: { type: DataTypes.STRING(120), allowNull: true },
  requesterPhone: { type: DataTypes.STRING(40), allowNull: true },
  requestedAt: { type: DataTypes.DATE, allowNull: true },
  requestNote: { type: DataTypes.STRING(300), allowNull: true },
  clientProofAssetId: { type: DataTypes.UUID, allowNull: true },
  legacyUuid: { type: DataTypes.STRING(64), allowNull: true },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
});

module.exports = Gift;
module.exports.GIFT_STATUSES = GIFT_STATUSES;
