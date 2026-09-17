// Token del link de la lista de invitados: "<id>~<firma>".
// Mismo esquema que el portal, pero con otra clave: un link no sirve para el otro.
const crypto = require("crypto");
const { jwtSecret } = require("../config/config");

const base = process.env.PORTAL_TOKEN_SECRET || jwtSecret;
const secret = crypto.createHmac("sha256", base).update("guest-list-links").digest();

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
const signature = (idBytes) => b64url(crypto.createHmac("sha256", secret).update(idBytes).digest()).slice(0, 32);

function signGuestListToken(giftId) {
  const idBytes = Buffer.from(String(giftId).replace(/-/g, ""), "hex");
  if (idBytes.length !== 16) return null;
  return `${b64url(idBytes)}~${signature(idBytes)}`;
}

/** Devuelve el id del regalo si la firma es válida; null en cualquier otro caso. */
function verifyGuestListToken(token) {
  if (typeof token !== "string" || token.length > 100) return null;
  const [idPart, sig] = token.split("~");
  if (!idPart || !sig) return null;
  const idBytes = Buffer.from(idPart, "base64url");
  if (idBytes.length !== 16) return null;
  const expected = Buffer.from(signature(idBytes));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const hex = idBytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = { signGuestListToken, verifyGuestListToken };
