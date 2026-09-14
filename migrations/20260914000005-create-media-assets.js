const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.createTable("MediaAssets", {
      id: { type: DataTypes.UUID, primaryKey: true },
      giftId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Gifts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      kind: { type: DataTypes.ENUM("image", "video", "audio"), allowNull: false },
      status: {
        type: DataTypes.ENUM("processing", "ready", "failed"),
        allowNull: false,
        defaultValue: "processing",
      },
      storage: { type: DataTypes.ENUM("local", "external"), allowNull: false, defaultValue: "local" },
      // Carpeta dentro de storage/media (local). Puede compartirse entre regalos duplicados.
      storageKey: { type: DataTypes.STRING(80), allowNull: true },
      // URL completa cuando storage = external (archivos de la API PHP legada).
      url: { type: DataTypes.STRING(512), allowNull: true },
      mimeType: { type: DataTypes.STRING(80), allowNull: true },
      sizeBytes: { type: DataTypes.BIGINT, allowNull: true },
      width: { type: DataTypes.INTEGER, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: true },
      durationSec: { type: DataTypes.FLOAT, allowNull: true },
      variants: { type: DataTypes.JSON, allowNull: false },
      placeholder: { type: DataTypes.TEXT, allowNull: true },
      // Sólo interno (editor/portal). Nunca se muestra en la experiencia pública.
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      uploadedBy: { type: DataTypes.ENUM("admin", "customer"), allowNull: false, defaultValue: "admin" },
      legacyMultimediaId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("MediaAssets", ["giftId"]);
    await queryInterface.addIndex("MediaAssets", ["storageKey"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("MediaAssets");
  },
};
