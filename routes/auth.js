const router = require("express").Router();
const auth = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimits");
const { login, me } = require("../controllers/authController");

router.post("/login", loginLimiter, login);
router.get("/me", auth, me);
// El registro público fue eliminado. Las cuentas admin se crean con:
//   npm run admin:create -- --email=... --password=...

module.exports = router;
