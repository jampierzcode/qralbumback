const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TemplateListing = sequelize.define("TemplateListing", {
  templateId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

const CollectionTemplate = sequelize.define("CollectionTemplate", {
  collectionId: { type: DataTypes.INTEGER, primaryKey: true },
  templateListingId: { type: DataTypes.INTEGER, primaryKey: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

module.exports = { TemplateListing, CollectionTemplate };
