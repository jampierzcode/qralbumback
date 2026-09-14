const crypto = require("crypto");

// Sin caracteres ambiguos (0/o, 1/l/i): fáciles de dictar y QR menos denso.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function randomSlug(length = 8) {
  return Array.from({ length }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
}

module.exports = { randomSlug };
