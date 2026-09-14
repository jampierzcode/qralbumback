const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Link privado para que el comprador complete el contenido de UN regalo.
const ContentRequest = sequelize.define("ContentRequest", {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  giftId: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM("active", "submitted", "revoked"), allowNull: false, defaultValue: "active" },
  allowedFields: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
  lastUsedAt: { type: DataTypes.DATE, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
});

module.exports = ContentRequest;
