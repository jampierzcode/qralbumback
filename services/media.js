const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const { MediaAsset } = require("../models");
const storage = require("./storage");
const { HttpError } = require("../middleware/errorHandler");
const { kindOfMime } = require("../middleware/upload");
const { detectFileSignature, signatureMatchesKind } = require("../utils/fileSignature");

// Variantes que se generan para cada imagen. El visor nunca carga originales.
const IMAGE_VARIANTS = [
  { name: "thumb", width: 480, quality: 70 },
  { name: "md", width: 1080, quality: 78 },
  { name: "lg", width: 2048, quality: 80 },
];

const EXT_BY_MIME = {
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/aac": "aac", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "weba",
};

const LIMITS_MB = { image: 25, video: 150, audio: 30 };

sharp.cache(false);

async function processImage(asset, file) {
  const folder = asset.id;
  const input = sharp(file.path, { limitInputPixels: 100_000_000, failOn: "error" }).rotate();
  let meta;
  try {
    meta = await input.metadata();
  } catch {
    throw new HttpError(415, "No pudimos leer esta imagen. Prueba con una foto JPG o PNG.");
  }

  const variants = {};
  for (const variant of IMAGE_VARIANTS) {
    const { data, info } = await sharp(file.path, { limitInputPixels: 100_000_000 })
      .rotate() // respeta la orientación EXIF; sharp elimina metadatos (GPS incluido) al exportar
      .resize({ width: variant.width, height: variant.width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: variant.quality })
      .toBuffer({ resolveWithObject: true });
    const key = `${folder}/${variant.name}.webp`;
    await storage.writeBuffer(key, data);
    variants[variant.name] = { url: storage.publicUrl(key), width: info.width, height: info.height };
  }

  const tiny = await sharp(file.path).rotate().resize(24, 24, { fit: "inside" }).webp({ quality: 40 }).toBuffer();

  await asset.update({
    status: "ready",
    storageKey: folder,
    width: variants.lg.width,
    height: variants.lg.height,
    variants,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    mimeType: `image/${meta.format}`,
  });
}

async function processBinary(asset, file) {
  const folder = asset.id;
  const key = `${folder}/source.${EXT_BY_MIME[file.mimetype] || "bin"}`;
  await storage.moveFile(file.path, key);
  await asset.update({
    status: "ready",
    storageKey: folder,
    variants: { source: { url: storage.publicUrl(key) } },
  });
}

/**
 * Procesa un archivo subido (multer) y lo asocia a un regalo.
 * @param {{ gift: object, file: object, uploadedBy: "admin"|"customer", expectedKind?: string, durationSec?: number }} params
 */
async function createFromUpload({ gift, file, uploadedBy, expectedKind, durationSec }) {
  if (!file) throw new HttpError(400, "No recibimos ningún archivo.");

  const kind = kindOfMime(file.mimetype);
  if (!kind) throw new HttpError(415, "Tipo de archivo no permitido.");
  if (expectedKind && kind !== expectedKind) {
    const labels = { image: "una imagen", video: "un video", audio: "un audio" };
    throw new HttpError(415, `Este campo necesita ${labels[expectedKind]}.`);
  }
  if (file.size > LIMITS_MB[kind] * 1024 * 1024) {
    throw new HttpError(413, `El archivo supera el máximo de ${LIMITS_MB[kind]} MB.`);
  }

  const signature = await detectFileSignature(file.path);
  if (!signatureMatchesKind(signature, kind)) {
    throw new HttpError(415, "El contenido del archivo no coincide con su tipo.");
  }
  if (signature === "heic") {
    throw new HttpError(415, "Las fotos HEIC no son compatibles. Vuelve a elegirla desde la galería o conviértela a JPG.");
  }

  const asset = await MediaAsset.create({
    id: crypto.randomUUID(),
    giftId: gift.id,
    kind,
    status: "processing",
    storage: "local",
    mimeType: file.mimetype,
    sizeBytes: file.size,
    originalName: file.originalname?.slice(0, 255),
    uploadedBy,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null,
    variants: {},
  });

  try {
    if (kind === "image") await processImage(asset, file);
    else await processBinary(asset, file);
  } catch (err) {
    await asset.destroy();
    await storage.removeFolder(asset.id).catch(() => {});
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, "No pudimos procesar el archivo. Intenta con otro.");
  }
  return asset;
}

async function deleteAsset(asset) {
  const { storageKey, storage: kind } = asset;
  await asset.destroy();
  if (kind === "local" && storageKey) {
    // Los regalos duplicados comparten archivos: sólo se borran si nadie más los usa.
    const stillUsed = await MediaAsset.count({ where: { storageKey } });
    if (!stillUsed) await storage.removeFolder(storageKey);
  }
}

function bestUrl(asset) {
  if (asset.storage === "external") return asset.url;
  const v = asset.variants || {};
  return v.lg?.url || v.md?.url || v.source?.url || null;
}

// Para el editor/admin/portal.
function serializeAsset(asset) {
  const v = asset.variants || {};
  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    url: bestUrl(asset),
    thumbUrl: v.thumb?.url || (asset.kind === "image" ? bestUrl(asset) : null),
    variants: v,
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    placeholder: asset.placeholder,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes ? Number(asset.sizeBytes) : null,
    originalName: asset.originalName,
    uploadedBy: asset.uploadedBy,
    createdAt: asset.createdAt,
  };
}

// Para la experiencia pública: sin nombre original, tamaño ni quién subió.
function serializePublicAsset(asset) {
  const { id, kind, url, thumbUrl, variants, width, height, durationSec, placeholder, mimeType } = serializeAsset(asset);
  return { id, kind, url, thumbUrl, variants, width, height, durationSec, placeholder, mimeType };
}

async function cleanupFile(file) {
  if (file?.path) await fs.promises.unlink(file.path).catch(() => {});
}

module.exports = { createFromUpload, deleteAsset, serializeAsset, serializePublicAsset, cleanupFile, LIMITS_MB };
