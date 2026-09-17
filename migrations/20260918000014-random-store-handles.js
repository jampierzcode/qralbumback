const { QueryTypes } = require("sequelize");
const { randomSlug } = require("../utils/slug");

// Los links de tienda pasan de "nombre-del-vendedor" a un código corto al azar,
// para que el link no revele quién vende ni deje adivinar el de otro.
module.exports = {
  async up({ context: { sequelize } }) {
    const users = await sequelize.query("SELECT id FROM Users WHERE handle IS NOT NULL", { type: QueryTypes.SELECT });
    for (const user of users) {
      let handle = randomSlug(8);
      while ((await sequelize.query("SELECT id FROM Users WHERE handle = ?", { replacements: [handle], type: QueryTypes.SELECT })).length) {
        handle = randomSlug(8);
      }
      await sequelize.query("UPDATE Users SET handle = ? WHERE id = ?", { replacements: [handle, user.id] });
    }
  },

  // No se puede volver a un nombre que ya no existe; se dejan los códigos.
  async down() {},
};
