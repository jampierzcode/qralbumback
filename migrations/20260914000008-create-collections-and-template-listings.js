const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: { queryInterface } }) {
    // Registro comercial de una plantilla cuyo CÓDIGO vive en el repositorio del frontend.
    await queryInterface.createTable("TemplateListings", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      templateId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.createTable("Collections", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      coverUrl: { type: DataTypes.STRING(512), allowNull: true },
      coverStorageKey: { type: DataTypes.STRING(120), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });

    // Una plantilla puede estar en varias colecciones, con orden propio en cada una.
    await queryInterface.createTable("CollectionTemplates", {
      collectionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "Collections", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      templateListingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "TemplateListings", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable("CollectionTemplates");
    await queryInterface.dropTable("Collections");
    await queryInterface.dropTable("TemplateListings");
  },
};
