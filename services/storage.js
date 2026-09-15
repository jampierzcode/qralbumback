// Almacenamiento de media.
//   STORAGE_DRIVER=local (por defecto) → disco (STORAGE_DIR), servido por Express.
//   STORAGE_DRIVER=s3                 → bucket S3 compatible (Railway Buckets, R2, AWS).
// En ambos casos la URL guardada en la base es la misma: /media/<clave>.
// Con S3 (bucket privado) /media/<clave> redirige a una URL firmada del bucket:
// los bytes salen del bucket y no pasan por el servidor.
const fs = require("fs");
const path = require("path");
const express = require("express");

const PUBLIC_PREFIX = "/media";
const DRIVER = (process.env.STORAGE_DRIVER || "local").toLowerCase();

const CONTENT_TYPES = {
  webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav", weba: "audio/webm",
};

function contentType(key) {
  return CONTENT_TYPES[path.extname(key).slice(1).toLowerCase()] || "application/octet-stream";
}

// Claves generadas por el servidor: "<uuid>/lg.webp", "collections/<id>/cover.webp"…
function checkKey(key) {
  const k = String(key);
  if (!k || k.startsWith("/") || k.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Ruta de almacenamiento inválida");
  }
  return k;
}

function publicUrl(key) {
  return `${PUBLIC_PREFIX}/${key}`;
}

function localDriver() {
  const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, "..", "storage"));
  const MEDIA_ROOT = path.join(STORAGE_ROOT, "media");
  fs.mkdirSync(MEDIA_ROOT, { recursive: true });

  function resolveKey(key) {
    const full = path.resolve(MEDIA_ROOT, checkKey(key));
    if (!full.startsWith(MEDIA_ROOT + path.sep)) throw new Error("Ruta de almacenamiento inválida");
    return full;
  }

  return {
    MEDIA_ROOT,
    async writeBuffer(key, buffer) {
      const full = resolveKey(key);
      await fs.promises.mkdir(path.dirname(full), { recursive: true });
      await fs.promises.writeFile(full, buffer);
    },
    async moveFile(sourcePath, key) {
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
    },
    async removeFolder(folder) {
      await fs.promises.rm(resolveKey(folder), { recursive: true, force: true });
    },
    // Nombres inmutables → cache larga. Soporta Range.
    mediaHandler() {
      return express.static(MEDIA_ROOT, { index: false, dotfiles: "deny", immutable: true, maxAge: "365d", fallthrough: false });
    },
  };
}

function s3Driver() {
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

  const bucket = process.env.S3_BUCKET;
  const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`STORAGE_DRIVER=s3 requiere ${missing.join(", ")}.`);

  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  const prefix = (process.env.S3_PREFIX || "media").replace(/^\/+|\/+$/g, "");
  const objectKey = (key) => (prefix ? `${prefix}/${checkKey(key)}` : checkKey(key));
  const CACHE = "public, max-age=31536000, immutable";

  const DAY = 86_400_000;
  const SIGNED_TTL = 7 * 24 * 3600; // máximo de SigV4

  return {
    MEDIA_ROOT: null,
    async writeBuffer(key, buffer) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey(key), Body: buffer, ContentType: contentType(key), CacheControl: CACHE }));
    },
    async moveFile(sourcePath, key) {
      const { size } = await fs.promises.stat(sourcePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(key),
          Body: fs.createReadStream(sourcePath),
          ContentLength: size,
          ContentType: contentType(key),
          CacheControl: CACHE,
        })
      );
      await fs.promises.unlink(sourcePath).catch(() => {});
    },
    async removeFolder(folder) {
      const base = `${objectKey(folder)}/`;
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: base, ContinuationToken: token }));
        const objects = (page.Contents || []).map((o) => ({ Key: o.Key }));
        if (objects.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
    mediaHandler() {
      return async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        let key;
        try {
          key = checkKey(decodeURIComponent(req.path.replace(/^\/+/, "")));
        } catch {
          return res.status(404).end();
        }
        try {
          // Firma fija durante el día → la misma URL todo el día y el navegador reutiliza su cache.
          const signingDate = new Date(Math.floor(Date.now() / DAY) * DAY);
          const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }), {
            expiresIn: SIGNED_TTL,
            signingDate,
          });
          res.set("Cache-Control", "public, max-age=3600").redirect(302, url);
        } catch (err) {
          next(err);
        }
      };
    },
    client,
    bucket,
    objectKey,
  };
}

const driver = DRIVER === "s3" ? s3Driver() : localDriver();

module.exports = {
  DRIVER,
  PUBLIC_PREFIX,
  MEDIA_ROOT: driver.MEDIA_ROOT,
  writeBuffer: driver.writeBuffer,
  moveFile: driver.moveFile,
  removeFolder: driver.removeFolder,
  mediaHandler: driver.mediaHandler,
  publicUrl,
  _driver: driver,
};
