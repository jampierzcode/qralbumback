// Seguridad (Fase 0):
// 1. Agrega el rol "admin" (el frontend ya lo contemplaba).
// 2. Las contraseñas de usuarios "cliente" se guardaban en texto plano.
//    Se reemplazan por su hash bcrypt. Esos usuarios nunca pudieron iniciar
//    sesión (el login compara con bcrypt), así que no se pierde funcionalidad.
const { DataTypes, QueryTypes } = require("sequelize");
const bcrypt = require("bcryptjs");

const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/;

module.exports = {
  async up({ context: { queryInterface, sequelize } }) {
    await queryInterface.changeColumn("Users", "role", {
      type: DataTypes.ENUM("superadmin", "admin", "cliente"),
      defaultValue: "cliente",
    });

    const users = await sequelize.query("SELECT id, password FROM Users", {
      type: QueryTypes.SELECT,
    });
    for (const user of users) {
      if (user.password && !BCRYPT_PREFIX.test(user.password)) {
        const hash = await bcrypt.hash(user.password, 10);
        await sequelize.query("UPDATE Users SET password = ? WHERE id = ?", {
          replacements: [hash, user.id],
        });
      }
    }
  },

  async down({ context: { queryInterface } }) {
    // Los hashes no se revierten (no se puede ni se debe recuperar texto plano).
    await queryInterface.changeColumn("Users", "role", {
      type: DataTypes.ENUM("superadmin", "admin", "cliente"),
      defaultValue: "cliente",
    });
  },
};
