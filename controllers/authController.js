const { User } = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret, jwtExpiresIn } = require("../config/config");
const { HttpError } = require("../middleware/errorHandler");

const ADMIN_ROLES = ["superadmin", "admin"];

exports.login = async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) throw new HttpError(400, "Ingresa tu correo y contraseña.");

  const user = await User.scope("withPassword").findOne({ where: { email } });
  const valid = user && (await bcrypt.compare(password, user.password));
  // Sólo las cuentas administrativas pueden iniciar sesión.
  if (!valid || !ADMIN_ROLES.includes(user.role)) {
    throw new HttpError(401, "Correo o contraseña incorrectos.");
  }

  const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
  res.json({ token, role: user.role, user: { id: user.id, name: user.name, email: user.email } });
};

exports.me = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    throw new HttpError(401, "Tu sesión ya no es válida.");
  }
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
};
