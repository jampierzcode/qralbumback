const multer = require("multer");
const { isTest } = require("../config/config");

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: "Recurso no encontrado." });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "El archivo es demasiado grande.",
      LIMIT_FILE_COUNT: "Demasiados archivos en una sola subida.",
      LIMIT_UNEXPECTED_FILE: "Campo de archivo inesperado.",
    };
    return res.status(413).json({ error: messages[err.code] || "Error al subir el archivo." });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "La información enviada es demasiado grande." });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El formato de la información no es válido." });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500 && !isTest) console.error("❌", err);

  res.status(status).json({
    error: status >= 500 ? "Ocurrió un error inesperado. Intenta nuevamente." : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = { HttpError, notFound, errorHandler };
