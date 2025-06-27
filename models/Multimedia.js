const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const User = require("./User");

const Multimedia = sequelize.define("Multimedia", {
  type: {
    type: DataTypes.ENUM("photo", "video", "audio"),
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
  },
});

// Relación: un usuario (cliente) puede tener muchos archivos multimedia
Multimedia.belongsTo(User, { foreignKey: "userId" });
User.hasMany(Multimedia, { foreignKey: "userId" });

module.exports = Multimedia;
