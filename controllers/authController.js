const { User } = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/config");

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.sendStatus(401);
  const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, {
    expiresIn: "1h",
  });
  res.json({ token, role: user.role });
};
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  const existing = await User.findOne({ where: { email } });
  if (existing) return res.status(400).json({ error: "Ya existe el usuario" });

  const hashed = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashed,
    role: role || "superadmin",
  });

  res.json({ success: true, user });
};
