const crypto = require("crypto");
const { Op, fn, col } = require("sequelize");
const { Gift, Customer, MediaAsset, GiftEvent, sequelize } = require("../models");
const { GIFT_STATUSES } = require("../models/Gift");
const { HttpError } = require("../middleware/errorHandler");
const { randomSlug } = require("../utils/slug");
const { optionalString, optionalInt, plainObject } = require("../utils/input");
const media = require("./media");
const registry = require("./templateRegistry");
const contentValidation = require("./contentValidation");

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

async function uniqueSlug(transaction) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = randomSlug();
    if (!(await Gift.count({ where: { slug }, transaction }))) return slug;
  }
  throw new Error("No se pudo generar un slug único");
}

async function findGiftOr404(id, options = {}) {
  const gift = await Gift.findByPk(id, options);
  if (!gift) throw new HttpError(404, "Regalo no encontrado.");
  return gift;
}

async function assertCustomerExists(customerId) {
  if (customerId && !(await Customer.count({ where: { id: customerId } }))) {
    throw new HttpError(400, "El cliente seleccionado no existe.");
  }
}

// Recorre el contenido y reemplaza referencias { assetId } con el mapa dado.
function remapAssetIds(value, map) {
  if (Array.isArray(value)) return value.map((v) => remapAssetIds(v, map));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "assetId" && map[v] ? map[v] : remapAssetIds(v, map);
    }
    return out;
  }
  return value;
}

function serializeGift(gift, { includeMedia = false } = {}) {
  const data = {
    id: gift.id,
    slug: gift.slug,
    customerId: gift.customerId,
    customer: gift.customer ? { id: gift.customer.id, name: gift.customer.name, phone: gift.customer.phone } : null,
    templateId: gift.templateId,
    templateVersion: gift.templateVersion,
    status: gift.status,
    recipientName: gift.recipientName,
    senderName: gift.senderName,
    occasion: gift.occasion,
    content: gift.content || {},
    settings: gift.settings || {},
    isLegacy: Boolean(gift.legacyUuid),
    publishedAt: gift.publishedAt,
    archivedAt: gift.archivedAt,
    createdAt: gift.createdAt,
    updatedAt: gift.updatedAt,
  };
  if (includeMedia) data.media = (gift.media || []).map(media.serializeAsset);
  return data;
}

async function listGifts(query = {}) {
  const where = {};
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 24));

  if (query.status) {
    if (!GIFT_STATUSES.includes(query.status)) throw new HttpError(400, "Estado inválido.");
    where.status = query.status;
  } else {
    where.status = { [Op.ne]: "archived" };
  }
  if (query.templateId) where.templateId = String(query.templateId);
  if (query.templateIds) where.templateId = { [Op.in]: [].concat(query.templateIds) };
  if (query.customerId) where.customerId = optionalInt(query.customerId, { field: "customerId" });
  if (query.from || query.to) {
    where.updatedAt = {};
    if (query.from) where.updatedAt[Op.gte] = new Date(query.from);
    if (query.to) where.updatedAt[Op.lte] = new Date(query.to);
  }
  if (query.q) {
    const like = { [Op.like]: `%${String(query.q).trim()}%` };
    where[Op.or] = [
      { recipientName: like },
      { senderName: like },
      { slug: like },
      { "$customer.name$": like },
      { "$customer.phone$": like },
    ];
  }

  const { rows, count } = await Gift.findAndCountAll({
    where,
    include: [{ model: Customer, as: "customer", attributes: ["id", "name", "phone"] }],
    order: [["updatedAt", "DESC"]],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    subQuery: false,
  });

  return { items: rows.map((g) => serializeGift(g)), total: count, page, pageSize };
}

async function getGift(id) {
  const gift = await findGiftOr404(id, {
    include: [
      { model: Customer, as: "customer", attributes: ["id", "name", "phone", "email"] },
      { model: MediaAsset, as: "media" },
    ],
    order: [[{ model: MediaAsset, as: "media" }, "createdAt", "ASC"]],
  });
  const opens = await GiftEvent.count({ where: { giftId: gift.id, type: "opened" } });
  return { ...serializeGift(gift, { includeMedia: true }), stats: { opens } };
}

function readBasics(body) {
  const basics = {};
  if (body.recipientName !== undefined)
    basics.recipientName = optionalString(body.recipientName, { field: "recipientName", max: 120 }) || "";
  if (body.senderName !== undefined)
    basics.senderName = optionalString(body.senderName, { field: "senderName", max: 120 }) || "";
  if (body.occasion !== undefined) basics.occasion = optionalString(body.occasion, { field: "occasion", max: 64 }) || null;
  if (body.customerId !== undefined) basics.customerId = optionalInt(body.customerId, { field: "customerId" });
  if (body.content !== undefined) basics.content = plainObject(body.content, { field: "content" });
  if (body.settings !== undefined) basics.settings = plainObject(body.settings, { field: "settings", maxBytes: 20_000 });
  return basics;
}

async function createGift(body = {}) {
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const template = TEMPLATE_ID.test(templateId) ? await registry.getTemplate(templateId) : null;
  if (!template) throw new HttpError(400, "Selecciona una plantilla válida.");

  const basics = readBasics(body);
  await assertCustomerExists(basics.customerId);

  const gift = await sequelize.transaction(async (transaction) =>
    Gift.create(
      {
        id: crypto.randomUUID(),
        slug: await uniqueSlug(transaction),
        templateId,
        templateVersion: template.manifest.version || 1,
        status: "draft",
        recipientName: "",
        senderName: "",
        content: {},
        settings: {},
        ...basics,
      },
      { transaction }
    )
  );
  return getGift(gift.id);
}

async function updateGift(id, body = {}) {
  const gift = await findGiftOr404(id);
  const basics = readBasics(body);
  await assertCustomerExists(basics.customerId);

  if (basics.content !== undefined) {
    const { content, bound } = await contentValidation.applyContentUpdate(gift, basics.content);
    basics.content = content;
    // Los nombres enviados fuera de content tienen prioridad.
    for (const [key, value] of Object.entries(bound)) {
      if (basics[key] === undefined) basics[key] = String(value || "").trim().slice(0, 120);
    }
  }

  await gift.update(basics);
  return getGift(gift.id);
}

async function setStatus(id, status) {
  if (!GIFT_STATUSES.includes(status)) throw new HttpError(400, "Estado inválido.");
  const gift = await findGiftOr404(id);
  if (status === "published") await contentValidation.assertComplete(gift);
  const changes = { status };
  if (status === "published" && !gift.publishedAt) changes.publishedAt = new Date();
  if (status === "archived") changes.archivedAt = new Date();
  if (status !== "archived" && gift.archivedAt) changes.archivedAt = null;
  await gift.update(changes);
  return getGift(gift.id);
}

async function duplicateGift(id) {
  const source = await findGiftOr404(id, { include: [{ model: MediaAsset, as: "media" }] });

  const copyId = await sequelize.transaction(async (transaction) => {
    const copy = await Gift.create(
      {
        id: crypto.randomUUID(),
        slug: await uniqueSlug(transaction),
        customerId: source.customerId,
        templateId: source.templateId,
        templateVersion: source.templateVersion,
        status: "draft",
        recipientName: source.recipientName,
        senderName: source.senderName,
        occasion: source.occasion,
        content: {},
        settings: source.settings || {},
      },
      { transaction }
    );

    // Las copias de media comparten archivos (storageKey) para no duplicar disco.
    const map = {};
    for (const asset of source.media) {
      const newId = crypto.randomUUID();
      map[asset.id] = newId;
      const { id: _omit, giftId: _g, legacyMultimediaId: _l, createdAt: _c, updatedAt: _u, ...rest } = asset.get();
      await MediaAsset.create({ ...rest, id: newId, giftId: copy.id }, { transaction });
    }
    await copy.update({ content: remapAssetIds(source.content || {}, map) }, { transaction });
    return copy.id;
  });

  return getGift(copyId);
}

async function addMedia(id, { file, uploadedBy = "admin", expectedKind, durationSec }) {
  const gift = await findGiftOr404(id);
  const asset = await media.createFromUpload({ gift, file, uploadedBy, expectedKind, durationSec });
  gift.changed("updatedAt", true);
  await gift.save();
  return media.serializeAsset(asset);
}

async function removeMedia(giftId, assetId) {
  const asset = await MediaAsset.findOne({ where: { id: assetId, giftId } });
  if (!asset) throw new HttpError(404, "Archivo no encontrado.");
  const gift = await findGiftOr404(giftId);
  await media.deleteAsset(asset);
  await gift.update({ content: contentValidation.stripAssetRefs(gift.content || {}, assetId) });
}

async function templateUsage() {
  const rows = await Gift.findAll({
    attributes: ["templateId", [fn("COUNT", col("id")), "count"]],
    where: { status: { [Op.ne]: "archived" } },
    group: ["templateId"],
    raw: true,
  });
  return rows.map((r) => ({ templateId: r.templateId, count: Number(r.count) }));
}

module.exports = {
  listGifts,
  getGift,
  createGift,
  updateGift,
  setStatus,
  duplicateGift,
  addMedia,
  removeMedia,
  templateUsage,
  serializeGift,
  findGiftOr404,
  remapAssetIds,
};
