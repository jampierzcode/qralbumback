const { rateLimit } = require("express-rate-limit");
const { isTest } = require("../config/config");

const base = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
};

const loginLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 10 });
const eventsLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 30 });

module.exports = { loginLimiter, eventsLimiter };
