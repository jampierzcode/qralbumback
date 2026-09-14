const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable("Gifts", {
      id: { type: DataTypes.UUID, primaryKey: true },
      slug: { type: DataTypes.STRING(16), allowNull: false, unique: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Customers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      templateId: { type: DataTypes.STRING(64), allowNull: false },
      templateVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: {
        type: DataTypes.ENUM("draft", "collecting_content", "ready", "published", "archived"),
        allowNull: false,
        defaultValue: "draft",
      },
      recipientName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
      senderName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
      occasion: { type: DataTypes.STRING(64), allowNull: true },
      content: { type: DataTypes.JSON, allowNull: false },
      settings: { type: DataTypes.JSON, allowNull: false },
      // uuid del álbum antiguo: mantiene vivos los QR ya entregados (/c/:uuid).
      legacyUuid: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("Gifts", ["status"]);
    await queryInterface.addIndex("Gifts", ["templateId"]);
    await queryInterface.addIndex("Gifts", ["updatedAt"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("Gifts");
  },
};
