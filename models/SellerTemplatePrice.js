const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// A cuánto vende cada vendedor una plantilla. Su costo es TemplateListings.referralPrice.
const SellerTemplatePrice = sequelize.define("SellerTemplatePrice", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  templateId: { type: DataTypes.STRING(64), allowNull: false },
  salePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
});

module.exports = SellerTemplatePrice;
