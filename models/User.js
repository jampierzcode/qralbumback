const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "User",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("superadmin", "admin", "cliente", "referido"),
      defaultValue: "cliente",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    phone: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    // Tienda pública: /pedir/<handle>
    handle: { type: DataTypes.STRING(40), allowNull: true, unique: true },
    publicName: { type: DataTypes.STRING(120), allowNull: true },
    publicMessage: { type: DataTypes.STRING(300), allowNull: true },
    ordersEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    uuid: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true, // Solo se asigna si es un cliente
    },
  },
  {
    // La contraseña nunca sale de la base salvo que se pida explícitamente.
    defaultScope: { attributes: { exclude: ["password"] } },
    scopes: { withPassword: { attributes: { include: ["password"] } } },
  }
);

User.prototype.toJSON = function toJSON() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

module.exports = User;
