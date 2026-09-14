const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable("Customers", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      email: { type: DataTypes.STRING(160), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      // Enlace al User rol "cliente" del modelo anterior.
      legacyUserId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("Customers", ["name"]);
    await queryInterface.addIndex("Customers", ["phone"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("Customers");
  },
};
