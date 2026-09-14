const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/config");

module.exports = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Inicia sesión para continuar." });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." });
  }
};
