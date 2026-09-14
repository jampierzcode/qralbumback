const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Collection = sequelize.define("Collection", {
  slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  coverUrl: { type: DataTypes.STRING(512), allowNull: true },
  coverStorageKey: { type: DataTypes.STRING(120), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

module.exports = Collection;
