const { DataTypes } = require("sequelize");

// Pedidos públicos: cada vendedor comparte /pedir/<handle> y el cliente final arma su regalo.
//   Users → identificador público, nombre de tienda, mensaje y si acepta pedidos
//   Gifts → de quién vino el pedido, en qué estado está y su comprobante
module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.addColumn("Users", "handle", { type: DataTypes.STRING(40), allowNull: true, unique: true });
    await queryInterface.addColumn("Users", "publicName", { type: DataTypes.STRING(120), allowNull: true });
    await queryInterface.addColumn("Users", "publicMessage", { type: DataTypes.STRING(300), allowNull: true });
    await queryInterface.addColumn("Users", "ordersEnabled", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });

    await queryInterface.addColumn("Gifts", "requestStatus", {
      type: DataTypes.ENUM("none", "draft", "pending", "accepted", "rejected"),
      allowNull: false,
      defaultValue: "none",
    });
    await queryInterface.addColumn("Gifts", "requesterName", { type: DataTypes.STRING(120), allowNull: true });
    await queryInterface.addColumn("Gifts", "requesterPhone", { type: DataTypes.STRING(40), allowNull: true });
    await queryInterface.addColumn("Gifts", "requestedAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn("Gifts", "requestNote", { type: DataTypes.STRING(300), allowNull: true });
    await queryInterface.addColumn("Gifts", "clientProofAssetId", { type: DataTypes.UUID, allowNull: true });
    await queryInterface.addIndex("Gifts", ["createdById", "requestStatus"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.removeIndex("Gifts", ["createdById", "requestStatus"]);
    for (const column of ["requestStatus", "requesterName", "requesterPhone", "requestedAt", "requestNote", "clientProofAssetId"]) {
      await queryInterface.removeColumn("Gifts", column);
    }
    for (const column of ["handle", "publicName", "publicMessage", "ordersEnabled"]) {
      await queryInterface.removeColumn("Users", column);
    }
  },
};
