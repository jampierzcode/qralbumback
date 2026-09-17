const crypto = require("crypto");
const { Op, fn, col } = require("sequelize");
const { Gift, Customer, User, MediaAsset, GiftEvent, CollectionTemplate, TemplateListing, sequelize } = require("../models");
const { GIFT_STATUSES } = require("../models/Gift");
const { HttpError } = require("../middleware/errorHandler");
const { randomSlug } = require("../utils/slug");
const { optionalString, optionalInt, plainObject } = require("../utils/input");
const media = require("./media");
const registry = require("./templateRegistry");
const contentValidation = require("./contentValidation");
const sellers = require("./sellers");
const { signGuestListToken } = require("../utils/guestListToken");

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const REVIEW_STATUSES = ["none", "pending", "approved", "rejected"];

// Un referido sólo ve y edita lo que él creó, y no puede compartir hasta que apruebes.
function isReferral(actor) {
  return actor?.role === "referido";
}

function assertOwnership(gift, actor) {
  if (isReferral(actor) && gift.createdById !== actor.id) throw new HttpError(404, "Regalo no encontrado.");
  return gift;
}

// El link/QR sólo existe para el referido cuando el regalo está aprobado.
function canShare(gift, actor) {
  return !isReferral(actor) || gift.reviewStatus === "approved";
}

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

function serializeGift(gift, { includeMedia = false, actor = null } = {}) {
  const shareable = canShare(gift, actor);
  const data = {
    id: gift.id,
    slug: shareable ? gift.slug : null,
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
    createdById: gift.createdById,
    createdBy: gift.createdBy ? { id: gift.createdBy.id, name: gift.createdBy.name } : null,
    reviewStatus: gift.reviewStatus,
    submittedAt: gift.submittedAt,
    reviewedAt: gift.reviewedAt,
    reviewNote: gift.reviewNote,
    price: gift.price === null || gift.price === undefined ? null : Number(gift.price),
    salePrice: gift.salePrice === null || gift.salePrice === undefined ? null : Number(gift.salePrice),
    currency: gift.currency,
    paidAt: gift.paidAt,
    hasPaymentProof: Boolean(gift.paymentProofAssetId),
    canShare: shareable,
    publishedAt: gift.publishedAt,
    archivedAt: gift.archivedAt,
    createdAt: gift.createdAt,
    updatedAt: gift.updatedAt,
  };
  if (includeMedia) {
    // El comprobante de pago no es parte del regalo: no aparece en el editor.
    data.media = (gift.media || []).filter((a) => a.id !== gift.paymentProofAssetId).map(media.serializeAsset);
  }
  return data;
}

async function listGifts(query = {}, actor = null) {
  const where = {};
  if (isReferral(actor)) where.createdById = actor.id;
  else if (query.createdById) where.createdById = optionalInt(query.createdById, { field: "createdById" });
  if (query.reviewStatus) {
    if (!REVIEW_STATUSES.includes(query.reviewStatus)) throw new HttpError(400, "Estado de revisión inválido.");
    where.reviewStatus = query.reviewStatus;
  }
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
  if (query.collectionId) {
    const rows = await CollectionTemplate.findAll({
      where: { collectionId: optionalInt(query.collectionId, { field: "collectionId" }) },
      include: [{ model: TemplateListing, as: "listing", attributes: ["templateId"] }],
    });
    const ids = rows.map((r) => r.listing?.templateId).filter(Boolean);
    const scoped = query.templateId ? ids.filter((t) => t === String(query.templateId)) : ids;
    where.templateId = { [Op.in]: scoped.length ? scoped : ["__ninguna__"] };
  }
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
    include: [
      { model: Customer, as: "customer", attributes: ["id", "name", "phone"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
    ],
    order: [["updatedAt", "DESC"]],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    subQuery: false,
  });

  return { items: rows.map((g) => serializeGift(g, { actor })), total: count, page, pageSize };
}

async function getGift(id, actor = null) {
  const gift = await findGiftOr404(id, {
    include: [
      { model: Customer, as: "customer", attributes: ["id", "name", "phone", "email"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
      { model: MediaAsset, as: "media" },
    ],
    order: [[{ model: MediaAsset, as: "media" }, "createdAt", "ASC"]],
  });
  assertOwnership(gift, actor);
  const opens = await GiftEvent.count({ where: { giftId: gift.id, type: "opened" } });
  const template = await registry.getTemplate(gift.templateId);
  // Link de la lista de invitados (sólo para plantillas que reciben confirmaciones).
  const guestListToken = template?.manifest.collectsResponses?.includes("rsvp") ? signGuestListToken(gift.id) : null;
  return { ...serializeGift(gift, { includeMedia: true, actor }), guestListToken, stats: { opens } };
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
  if (body.salePrice !== undefined) {
    if (body.salePrice === null || body.salePrice === "") basics.salePrice = null;
    else {
      const sale = Number(body.salePrice);
      if (!Number.isFinite(sale) || sale < 0 || sale > 99999) throw new HttpError(400, "Precio de venta inválido.");
      basics.salePrice = sale;
    }
  }
  return basics;
}

async function createGift(body = {}, actor = null) {
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const template = TEMPLATE_ID.test(templateId) ? await registry.getTemplate(templateId) : null;
  if (!template) throw new HttpError(400, "Selecciona una plantilla válida.");

  const basics = readBasics(body);
  await assertCustomerExists(basics.customerId);
  // Precio de venta del vendedor para esta plantilla (puede cambiarlo después).
  if (basics.salePrice === undefined) basics.salePrice = await sellers.salePriceFor(actor?.id, templateId);

  const gift = await sequelize.transaction(async (transaction) =>
    Gift.create(
      {
        id: crypto.randomUUID(),
        slug: await uniqueSlug(transaction),
        templateId,
        templateVersion: template.manifest.version || 1,
        status: "draft",
        createdById: actor?.id ?? null,
        recipientName: "",
        senderName: "",
        content: {},
        settings: {},
        ...basics,
      },
      { transaction }
    )
  );
  return getGift(gift.id, actor);
}

async function updateGift(id, body = {}, actor = null) {
  const gift = assertOwnership(await findGiftOr404(id), actor);
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
  return getGift(gift.id, actor);
}

async function setStatus(id, status, actor = null) {
  if (!GIFT_STATUSES.includes(status)) throw new HttpError(400, "Estado inválido.");
  const gift = assertOwnership(await findGiftOr404(id), actor);
  // El referido no publica: el regalo se publica solo cuando apruebas su solicitud.
  if (isReferral(actor) && status === "published" && gift.reviewStatus !== "approved") {
    throw new HttpError(403, "Envía el regalo a aprobación para poder compartirlo.");
  }
  if (status === "published") await contentValidation.assertComplete(gift);
  const changes = { status };
  if (status === "published" && !gift.publishedAt) changes.publishedAt = new Date();
  if (status === "archived") changes.archivedAt = new Date();
  if (status !== "archived" && gift.archivedAt) changes.archivedAt = null;
  await gift.update(changes);
  return getGift(gift.id, actor);
}

async function duplicateGift(id, actor = null) {
  const source = assertOwnership(await findGiftOr404(id, { include: [{ model: MediaAsset, as: "media" }] }), actor);

  const copyId = await sequelize.transaction(async (transaction) => {
    const copy = await Gift.create(
      {
        id: crypto.randomUUID(),
        slug: await uniqueSlug(transaction),
        customerId: source.customerId,
        createdById: source.createdById,
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

  return getGift(copyId, actor);
}

async function addMedia(id, { file, uploadedBy = "admin", expectedKind, durationSec }, actor = null) {
  const gift = assertOwnership(await findGiftOr404(id), actor);
  const asset = await media.createFromUpload({ gift, file, uploadedBy, expectedKind, durationSec });
  gift.changed("updatedAt", true);
  await gift.save();
  return media.serializeAsset(asset);
}

async function removeMedia(giftId, assetId, actor = null) {
  const gift = assertOwnership(await findGiftOr404(giftId), actor);
  const asset = await MediaAsset.findOne({ where: { id: assetId, giftId } });
  if (!asset) throw new HttpError(404, "Archivo no encontrado.");
  if (asset.id === gift.paymentProofAssetId) throw new HttpError(400, "Ese archivo es el comprobante de pago.");
  await media.deleteAsset(asset);
  await gift.update({ content: contentValidation.stripAssetRefs(gift.content || {}, assetId) });
}

async function dashboard(actor = null) {
  const scope = isReferral(actor) ? { createdById: actor.id } : {};
  const counts = await Gift.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    where: scope,
    group: ["status"],
    raw: true,
  });
  const byStatus = Object.fromEntries(counts.map((r) => [r.status, Number(r.count)]));
  const total = Object.entries(byStatus).reduce((sum, [status, n]) => (status === "archived" ? sum : sum + n), 0);
  const opens = await GiftEvent.count({
    where: { type: "opened" },
    include: isReferral(actor) ? [{ model: Gift, as: "gift", attributes: [], required: true, where: scope }] : [],
  });
  const recent = await Gift.findAll({
    where: { ...scope, status: { [Op.ne]: "archived" } },
    include: [
      { model: Customer, as: "customer", attributes: ["id", "name", "phone"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
    ],
    order: [["updatedAt", "DESC"]],
    limit: 6,
  });
  const pendingReview = await Gift.count({ where: { ...scope, reviewStatus: "pending" } });
  const usage = (await templateUsage(actor)).sort((a, b) => b.count - a.count).slice(0, 5);
  return {
    stats: {
      total,
      draft: byStatus.draft || 0,
      collectingContent: byStatus.collecting_content || 0,
      ready: byStatus.ready || 0,
      published: byStatus.published || 0,
      archived: byStatus.archived || 0,
      opens,
      pendingReview,
    },
    recentGifts: recent.map((g) => serializeGift(g, { actor })),
    topTemplates: usage,
  };
}

async function templateUsage(actor = null) {
  const rows = await Gift.findAll({
    attributes: ["templateId", [fn("COUNT", col("id")), "count"]],
    where: { ...(isReferral(actor) ? { createdById: actor.id } : {}), status: { [Op.ne]: "archived" } },
    group: ["templateId"],
    raw: true,
  });
  return rows.map((r) => ({ templateId: r.templateId, count: Number(r.count) }));
}

module.exports = {
  REVIEW_STATUSES,
  isReferral,
  assertOwnership,
  listGifts,
  getGift,
  createGift,
  updateGift,
  setStatus,
  duplicateGift,
  addMedia,
  removeMedia,
  templateUsage,
  dashboard,
  serializeGift,
  findGiftOr404,
  remapAssetIds,
};
