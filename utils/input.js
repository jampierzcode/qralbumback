const { HttpError } = require("../middleware/errorHandler");

// Lectores de entrada simples con mensajes humanos.
function optionalString(value, { field, max = 255 } = {}) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw new HttpError(400, `"${field}" debe ser texto.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `"${field}" admite máximo ${max} caracteres.`);
  return trimmed;
}

function requiredString(value, { field, label = field, max = 255 } = {}) {
  const result = optionalString(value, { field: label, max });
  if (!result) throw new HttpError(400, `${label} es obligatorio.`);
  return result;
}

function optionalInt(value, { field } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `"${field}" no es válido.`);
  return n;
}

function plainObject(value, { field, maxBytes = 200_000 } = {}) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `"${field}" debe ser un objeto.`);
  }
  if (Buffer.byteLength(JSON.stringify(value)) > maxBytes) {
    throw new HttpError(413, `"${field}" es demasiado grande.`);
  }
  return value;
}

module.exports = { optionalString, requiredString, optionalInt, plainObject };
