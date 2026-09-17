// Sirve el build del frontend (producción) e inyecta metadatos por regalo
// para que WhatsApp, Instagram y TikTok muestren una vista previa bonita.
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Gift, MediaAsset } = require("../models");
const registry = require("./templateRegistry");
const { loadGiftCore } = require("./giftCore");

const DEFAULT_DIST = path.resolve(__dirname, "..", "..", "qralbumfront", "dist");

function distDir() {
  return path.resolve(process.env.WEB_DIST_DIR || DEFAULT_DIST);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND = "MiAlbumQr";
const TAGLINE = "Regalos digitales para personas especiales";

function publicOrigin(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

/**
 * `title` va en la pestaña (lleva la marca) y `ogTitle` en la vista previa que
 * se ve al compartir el link (ahí manda el mensaje, no la marca).
 */
function renderHead(template, { title, ogTitle, description, image, url, noindex }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(ogTitle || title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    url && `<meta property="og:url" content="${escapeHtml(url)}" />`,
    image && `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    noindex && `<meta name="robots" content="noindex, nofollow" />`,
  ].filter(Boolean);
  return template
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}

async function giftMeta(slug, req) {
  const gift = await Gift.findOne({ where: { slug, status: "published" } });
  if (!gift) return null;
  const template = await registry.getTemplate(gift.templateId);
  const templateName = template?.manifest.name || "Regalo digital";

  let image = null;
  if (template?.schema) {
    const { collectAssetIds } = await loadGiftCore();
    const ids = collectAssetIds(template.schema, gift.content || {});
    if (ids.length) {
      const assets = await MediaAsset.findAll({ where: { id: ids, kind: "image", status: "ready" } });
      // Primera imagen en el orden del contenido.
      const first = ids.map((id) => assets.find((a) => a.id === id)).find(Boolean);
      const url = first?.variants?.md?.url || first?.url;
      if (url) image = url.startsWith("http") ? url : `${publicOrigin(req)}${url}`;
    }
  }

  const name = gift.recipientName?.trim();
  const headline = name ? `Un regalo para ${name} 💛` : `Tienes un regalo 💛`;
  return {
    title: `${headline} · ${BRAND}`,
    ogTitle: headline,
    description: gift.senderName ? `${gift.senderName} preparó algo especial para ti. Ábrelo con el sonido encendido.` : `Alguien preparó algo especial para ti: ${templateName}.`,
    image,
    url: `${publicOrigin(req)}/g/${gift.slug}`,
    noindex: true,
  };
}

/**
 * Monta el frontend compilado si existe (o si SERVE_WEB=true).
 * Devuelve false cuando no hay build (desarrollo con Vite).
 */
function mountWeb(app) {
  const dir = distDir();
  const indexFile = path.join(dir, "index.html");
  if (process.env.SERVE_WEB === "false" || !fs.existsSync(indexFile)) return false;

  const template = () => fs.readFileSync(indexFile, "utf8");
  const baseMeta = {
    title: `${BRAND} · ${TAGLINE}`,
    description: `${BRAND} · ${TAGLINE}`,
  };

  app.use("/assets", express.static(path.join(dir, "assets"), { immutable: true, maxAge: "365d", index: false, fallthrough: false }));
  app.use(express.static(dir, { index: false, maxAge: "1h" }));

  app.get("/g/:slug", async (req, res, next) => {
    try {
      const meta = await giftMeta(String(req.params.slug), req);
      res.status(meta ? 200 : 404).set("Cache-Control", "no-store").type("html");
      res.send(renderHead(template(), meta || { ...baseMeta, title: `Regalo no disponible · ${BRAND}`, noindex: true }));
    } catch (err) {
      next(err);
    }
  });

  app.get(/^\/(?!api\/|media\/).*/, (req, res) => {
    const isPrivate = /^\/(upload|admin|login|frame)/.test(req.path);
    res.set("Cache-Control", "no-cache").type("html").send(renderHead(template(), { ...baseMeta, noindex: isPrivate }));
  });

  return true;
}

module.exports = { mountWeb, renderHead, escapeHtml };
