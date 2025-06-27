const sequelize = require("../config/db");
const User = require("./User");
const Multimedia = require("./Multimedia");

// Relaciones
User.hasMany(Multimedia, { foreignKey: "userId" });
Multimedia.belongsTo(User, { foreignKey: "userId" });

module.exports = {
  sequelize,
  User,
  Multimedia,
};
