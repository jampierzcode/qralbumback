// Baseline: reproduce el esquema que antes creaba sequelize.sync().
// Sólo crea las tablas si NO existen, para que funcione tanto en bases nuevas
// como en la base de producción creada originalmente con sync().
const { DataTypes } = require("sequelize");

async function tableExists(queryInterface, name) {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(name);
}

module.exports = {
  async up({ context: { queryInterface } }) {
    if (!(await tableExists(queryInterface, "Users"))) {
      await queryInterface.createTable("Users", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false, unique: true },
        password: { type: DataTypes.STRING, allowNull: false },
        role: { type: DataTypes.ENUM("superadmin", "cliente"), defaultValue: "cliente" },
        uuid: { type: DataTypes.STRING, allowNull: true, unique: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
    }

    if (!(await tableExists(queryInterface, "Multimedia"))) {
      await queryInterface.createTable("Multimedia", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        type: { type: DataTypes.ENUM("photo", "video", "audio"), allowNull: false },
        url: { type: DataTypes.STRING, allowNull: false },
        name: { type: DataTypes.STRING },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
      });
    }
  },

  // Nunca se eliminan tablas con datos reales: el baseline no se revierte.
  async down() {
    throw new Error("La migración baseline no es reversible.");
  },
};
