// Almacenamiento de media. Implementación local en disco.
// Para migrar a S3/R2 basta con reimplementar estas funciones.
const fs = require("fs");
const path = require("path");

const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "..", "storage"));
const MEDIA_ROOT = path.join(STORAGE_ROOT, "media");
const PUBLIC_PREFIX = "/media";

fs.mkdirSync(MEDIA_ROOT, { recursive: true });

function resolveKey(key) {
  const full = path.resolve(MEDIA_ROOT, key);
  if (!full.startsWith(MEDIA_ROOT + path.sep)) throw new Error("Ruta de almacenamiento inválida");
  return full;
}

async function writeBuffer(key, buffer) {
  const full = resolveKey(key);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
}

async function moveFile(sourcePath, key) {
  const full = resolveKey(key);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  try {
    await fs.promises.rename(sourcePath, full);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    // tmp y storage en distintos discos
    await fs.promises.copyFile(sourcePath, full);
    await fs.promises.unlink(sourcePath);
  }
}

async function removeFolder(folder) {
  await fs.promises.rm(resolveKey(folder), { recursive: true, force: true });
}

function publicUrl(key) {
  return `${PUBLIC_PREFIX}/${key}`;
}

module.exports = { MEDIA_ROOT, PUBLIC_PREFIX, writeBuffer, moveFile, removeFolder, publicUrl };
