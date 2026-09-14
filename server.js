const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { corsOrigins } = require("./config/config");
const { notFound, errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
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
  app.use("/api/clients", require("./routes/clients"));
  app.use("/api/upload", require("./routes/upload"));
  // Eliminado: app.use("/uploads", express.static("uploads")) — exponía temporales.

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
