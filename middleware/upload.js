const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { HttpError } = require("./errorHandler");

// Los temporales viven fuera del proyecto y NUNCA se sirven públicamente.
const TMP_DIR = path.join(os.tmpdir(), "qralbum-uploads");
fs.mkdirSync(TMP_DIR, { recursive: true });

const MB = 1024 * 1024;

const ALLOWED = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm"],
};

const ALL_MIME = new Set(Object.values(ALLOWED).flat());

function kindOfMime(mime) {
  return Object.keys(ALLOWED).find((kind) => ALLOWED[kind].includes(mime));
}

function createUploader({ maxFileSizeMB = 100, maxFiles = 20, allowedKinds = Object.keys(ALLOWED) } = {}) {
  return multer({
    storage: multer.diskStorage({
      destination: TMP_DIR,
      filename: (req, file, cb) => cb(null, crypto.randomUUID()),
    }),
    limits: { fileSize: maxFileSizeMB * MB, files: maxFiles, fields: 20 },
    fileFilter: (req, file, cb) => {
      const kind = kindOfMime(file.mimetype);
      if (!ALL_MIME.has(file.mimetype) || !allowedKinds.includes(kind)) {
        return cb(new HttpError(415, `Tipo de archivo no permitido: ${file.originalname}`));
      }
      cb(null, true);
    },
  });
}

// Borra temporales pase lo que pase. Usar en finally.
async function cleanupTempFiles(req) {
  const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
  await Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => {})));
}

module.exports = { createUploader, cleanupTempFiles, kindOfMime, ALLOWED, MB };
