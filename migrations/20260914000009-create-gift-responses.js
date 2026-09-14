const { DataTypes } = require("sequelize");

// Respuestas de quienes abren un regalo (ej. confirmación de asistencia a una invitación).
module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable("GiftResponses", {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      giftId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Gifts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: { type: DataTypes.STRING(32), allowNull: false },
      name: { type: DataTypes.STRING(80), allowNull: false },
      answer: { type: DataTypes.STRING(16), allowNull: false },
      guests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      message: { type: DataTypes.STRING(300), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("GiftResponses", ["giftId", "type"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("GiftResponses");
  },
};
