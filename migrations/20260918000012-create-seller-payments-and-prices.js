const { DataTypes } = require("sequelize");

// Cada vendedor (dueño o referido) tiene sus datos de cobro y sus precios de venta.
//   PaymentMethods       → Yape, Plin, BIM o transferencia con los que le pagan a él
//   SellerTemplatePrices → a cuánto vende cada plantilla (su costo sigue siendo referralPrice)
module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable("PaymentMethods", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: { type: DataTypes.ENUM("yape", "plin", "bim", "transfer"), allowNull: false },
      holder: { type: DataTypes.STRING(120), allowNull: true },
      reference: { type: DataTypes.STRING(120), allowNull: false },
      bank: { type: DataTypes.STRING(80), allowNull: true },
      notes: { type: DataTypes.STRING(200), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("PaymentMethods", ["userId", "isActive"]);

    await queryInterface.createTable("SellerTemplatePrices", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      templateId: { type: DataTypes.STRING(64), allowNull: false },
      salePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addConstraint("SellerTemplatePrices", {
      fields: ["userId", "templateId"],
      type: "unique",
      name: "seller_template_unique",
    });
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("SellerTemplatePrices");
    await queryInterface.dropTable("PaymentMethods");
  },
};
