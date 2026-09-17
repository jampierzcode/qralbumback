// Tokens de los links privados del portal: "<id>~<firma>".
// El separador es "~" y no ".": WhatsApp corta el link en el punto y deja de reconocerlo.
// Los links antiguos (con ".") se siguen aceptando.
// La firma HMAC permite recalcular el link cuando el admin quiera copiarlo de nuevo,
// y un volcado de la base de datos por sí solo NO permite usar los links.
const crypto = require("crypto");
const { jwtSecret } = require("../config/config");

const secret = process.env.PORTAL_TOKEN_SECRET || crypto.createHmac("sha256", jwtSecret).update("portal-links").digest();

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function signature(idBytes) {
  return b64url(crypto.createHmac("sha256", secret).update(idBytes).digest()).slice(0, 32);
}

function signPortalToken(requestId) {
  const idBytes = Buffer.from(requestId.replace(/-/g, ""), "hex");
  return `${b64url(idBytes)}~${signature(idBytes)}`;
}

/** Devuelve el id (uuid) si la firma es válida; null en cualquier otro caso. */
function verifyPortalToken(token) {
  if (typeof token !== "string" || token.length > 100) return null;
  const [idPart, sig] = token.includes("~") ? token.split("~") : token.split(".");
  if (!idPart || !sig) return null;
  const idBytes = Buffer.from(idPart, "base64url");
  if (idBytes.length !== 16) return null;
  const expected = Buffer.from(signature(idBytes));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const hex = idBytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = { signPortalToken, verifyPortalToken };
