const { DataTypes } = require("sequelize");

// Cuánto le cobró el vendedor a SU cliente. Opcional: sirve para calcular su ganancia
// (salePrice - price) y para ver cuánto mueve cada referido.
module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.addColumn("Gifts", "salePrice", { type: DataTypes.DECIMAL(10, 2), allowNull: true });
  },
  async down({ context: { queryInterface } }) {
    await queryInterface.removeColumn("Gifts", "salePrice");
  },
};
