require("dotenv").config({ quiet: true });

const env = process.env.NODE_ENV || "development";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Revisa el archivo .env (ver .env.example).`
    );
  }
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (env === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET debe tener al menos 32 caracteres en producción.");
}

module.exports = {
  env,
  isTest: env === "test",
  port: Number(process.env.PORT) || 3001,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  // Orígenes permitidos separados por coma. Vacío = mismo origen únicamente.
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  legacyMediaApiUrl:
    process.env.LEGACY_MEDIA_API_URL ||
    "https://apimultimedia.mcsolucionesti.com/index.php",
};
