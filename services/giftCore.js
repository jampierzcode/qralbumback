// Carga gift-core (ESM) desde el frontend: el MISMO código valida en navegador y servidor.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DEFAULT_PATH = path.resolve(__dirname, "..", "..", "qralbumfront", "gift-core", "index.js");

let modulePromise = null;

function giftCorePath() {
  return path.resolve(process.env.GIFT_CORE_PATH || DEFAULT_PATH);
}

function loadGiftCore() {
  if (!modulePromise) {
    const file = giftCorePath();
    if (!fs.existsSync(file)) {
      return Promise.reject(
        new Error(`No se encontró gift-core en ${file}. Clona qralbumfront junto a qralbumback o define GIFT_CORE_PATH.`)
      );
    }
    modulePromise = import(pathToFileURL(file).href).catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

module.exports = { loadGiftCore, giftCorePath };
