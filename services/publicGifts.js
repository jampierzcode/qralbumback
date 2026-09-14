// Datos que ve el destinatario del regalo. Nunca incluye datos del comprador,
// estado interno, notas ni nombres originales de archivos.
const { Gift, MediaAsset, GiftEvent } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { serializePublicAsset } = require("./media");
const registry = require("./templateRegistry");
const { loadGiftCore } = require("./giftCore");

const EVENT_TYPES = ["opened", "completed", "music_started"];

async function mediaMapFor(gift, schema, { onlyReferenced = true } = {}) {
  let where = { giftId: gift.id, status: "ready" };
  if (onlyReferenced && schema) {
    const { collectAssetIds } = await loadGiftCore();
    const ids = collectAssetIds(schema, gift.content || {});
    if (!ids.length) return {};
    where = { ...where, id: ids };
  }
  const assets = await MediaAsset.findAll({ where });
  return Object.fromEntries(assets.map((a) => [a.id, serializePublicAsset(a)]));
}

function serializePublicGift(gift) {
  return {
    slug: gift.slug,
    templateId: gift.templateId,
    templateVersion: gift.templateVersion,
    recipientName: gift.recipientName,
    senderName: gift.senderName,
    occasion: gift.occasion,
    content: gift.content || {},
    settings: gift.settings || {},
    publishedAt: gift.publishedAt,
  };
}

async function getPublishedGift(slug) {
  const gift = await Gift.findOne({ where: { slug: String(slug), status: "published" } });
  if (!gift) throw new HttpError(404, "Este regalo no existe o todavía no está listo.");
  const template = await registry.getTemplate(gift.templateId);
  return { gift: serializePublicGift(gift), media: await mediaMapFor(gift, template?.schema) };
}

async function resolveLegacyUuid(uuid) {
  const gift = await Gift.findOne({ where: { legacyUuid: String(uuid), status: "published" }, attributes: ["slug"] });
  if (!gift) throw new HttpError(404, "Este regalo no existe o todavía no está listo.");
  return { slug: gift.slug };
}

async function recordEvent(slug, type) {
  if (!EVENT_TYPES.includes(type)) throw new HttpError(400, "Evento no válido.");
  const gift = await Gift.findOne({ where: { slug: String(slug), status: "published" }, attributes: ["id"] });
  if (!gift) throw new HttpError(404, "Regalo no encontrado.");
  await GiftEvent.create({ giftId: gift.id, type });
}

module.exports = { getPublishedGift, resolveLegacyUuid, recordEvent, mediaMapFor, serializePublicGift };
