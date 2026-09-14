const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const MediaAsset = sequelize.define("MediaAsset", {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  giftId: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.ENUM("image", "video", "audio"), allowNull: false },
  status: { type: DataTypes.ENUM("processing", "ready", "failed"), allowNull: false, defaultValue: "processing" },
  storage: { type: DataTypes.ENUM("local", "external"), allowNull: false, defaultValue: "local" },
  storageKey: { type: DataTypes.STRING(80), allowNull: true },
  url: { type: DataTypes.STRING(512), allowNull: true },
  mimeType: { type: DataTypes.STRING(80), allowNull: true },
  sizeBytes: { type: DataTypes.BIGINT, allowNull: true },
  width: { type: DataTypes.INTEGER, allowNull: true },
  height: { type: DataTypes.INTEGER, allowNull: true },
  durationSec: { type: DataTypes.FLOAT, allowNull: true },
  variants: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  placeholder: { type: DataTypes.TEXT, allowNull: true },
  originalName: { type: DataTypes.STRING(255), allowNull: true },
  uploadedBy: { type: DataTypes.ENUM("admin", "customer"), allowNull: false, defaultValue: "admin" },
  legacyMultimediaId: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = MediaAsset;
