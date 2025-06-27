const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/config");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.sendStatus(403);
  }
};
