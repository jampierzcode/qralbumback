const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { corsOrigins } = require("./config/config");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const storage = require("./services/storage");
const { mountWeb } = require("./services/web");

function createApp({ serveWeb = true } = {}) {
  const app = express();

  app.disable("x-powered-by");
  // Saltos de proxy confiables para obtener la IP real (rate limit). Railway = 1; Vercel → Railway = 2.
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // Ant Design (admin) inyecta estilos en tiempo de ejecución.
          styleSrc: ["'self'", "'unsafe-inline'"],
          // Media legada vive en un dominio externo (https) y los previews usan blob:.
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "blob:", "https:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
          frameAncestors: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: process.env.FORCE_HTTPS === "true" ? [] : null,
        },
      },
    })
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Sin Origin (curl, mismo origen vía proxy) o en la lista permitida.
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", require("./routes/auth"));
  // /api/clients y /api/upload (modelo anterior) fueron retirados en la Fase 5.
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api/public", require("./routes/public"));
  app.use("/api/portal", require("./routes/portal"));
  // Eliminado: app.use("/uploads", express.static("uploads")) — exponía temporales.

  // Media procesada (variantes WebP, audio, video): disco local o redirección firmada al bucket S3.
  app.use(storage.PUBLIC_PREFIX, storage.mediaHandler());

  app.use("/api", notFound);

  // Producción: el mismo servidor entrega el frontend compilado con metadatos por regalo.
  if (serveWeb) mountWeb(app);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
