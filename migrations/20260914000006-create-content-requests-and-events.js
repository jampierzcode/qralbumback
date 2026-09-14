const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable("ContentRequests", {
      id: { type: DataTypes.UUID, primaryKey: true },
      giftId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Gifts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      status: {
        type: DataTypes.ENUM("active", "submitted", "revoked"),
        allowNull: false,
        defaultValue: "active",
      },
      // Claves de campos del schema que el cliente puede editar.
      allowedFields: { type: DataTypes.JSON, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      submittedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("ContentRequests", ["giftId"]);

    await queryInterface.createTable("GiftEvents", {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      giftId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Gifts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: { type: DataTypes.STRING(32), allowNull: false },
      meta: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("GiftEvents", ["giftId", "type"]);
    await queryInterface.addIndex("GiftEvents", ["createdAt"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("GiftEvents");
    await queryInterface.dropTable("ContentRequests");
  },
};
