// Links privados para que el comprador complete el contenido de UN regalo.
const crypto = require("crypto");
const { Op } = require("sequelize");
const { ContentRequest, Gift, MediaAsset, sequelize } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { signPortalToken, verifyPortalToken } = require("../utils/portalToken");
const registry = require("./templateRegistry");
const { loadGiftCore } = require("./giftCore");
const contentValidation = require("./contentValidation");
const media = require("./media");
const orders = require("./orders");

const DAY = 24 * 60 * 60 * 1000;
const EDITABLE_GIFT_STATUSES = ["draft", "collecting_content", "ready"];

function serializeRequest(request) {
  const expired = request.expiresAt < new Date();
  return {
    id: request.id,
    status: request.status === "active" && expired ? "expired" : request.status,
    token: request.status === "revoked" ? null : signPortalToken(request.id),
    allowedFields: request.allowedFields,
    expiresAt: request.expiresAt,
    revokedAt: request.revokedAt,
    lastUsedAt: request.lastUsedAt,
    submittedAt: request.submittedAt,
    createdAt: request.createdAt,
  };
}

async function customerKeysFor(gift) {
  const template = await registry.getTemplate(gift.templateId);
  if (!template?.schema) throw new HttpError(409, "La plantilla de este regalo ya no está disponible.");
  const { getCustomerEditableKeys } = await loadGiftCore();
  return { schema: template.schema, manifest: template.manifest, keys: getCustomerEditableKeys(template.schema) };
}

// ── Admin ───────────────────────────────────────────────────────────────────
async function createRequest(giftId, body = {}) {
  const gift = await Gift.findByPk(giftId);
  if (!gift) throw new HttpError(404, "Regalo no encontrado.");
  if (!EDITABLE_GIFT_STATUSES.includes(gift.status)) {
    throw new HttpError(409, gift.status === "published" ? "Este regalo ya está publicado. Pásalo a borrador para pedir contenido." : "Este regalo está archivado.");
  }

  const { keys } = await customerKeysFor(gift);
  let allowedFields = keys;
  if (Array.isArray(body.allowedFields)) {
    allowedFields = body.allowedFields.filter((k) => keys.includes(k));
    if (!allowedFields.length) throw new HttpError(400, "Elige al menos un dato para que complete el cliente.");
  }
  const days = Math.min(60, Math.max(1, Number(body.expiresInDays) || 7));

  const request = await sequelize.transaction(async (transaction) => {
    // Un solo link activo por regalo: los anteriores se desactivan.
    await ContentRequest.update(
      { status: "revoked", revokedAt: new Date() },
      { where: { giftId, status: "active" }, transaction }
    );
    const created = await ContentRequest.create(
      { id: crypto.randomUUID(), giftId, status: "active", allowedFields, expiresAt: new Date(Date.now() + days * DAY) },
      { transaction }
    );
    if (gift.status !== "collecting_content") await gift.update({ status: "collecting_content" }, { transaction });
    return created;
  });
  return serializeRequest(request);
}

async function listRequests(giftId) {
  const requests = await ContentRequest.findAll({ where: { giftId }, order: [["createdAt", "DESC"]] });
  return requests.map(serializeRequest);
}

async function revokeRequest(id, actor = null) {
  const request = await ContentRequest.findByPk(id);
  if (!request) throw new HttpError(404, "Link no encontrado.");
  if (actor?.role === "referido") {
    const gift = await Gift.findByPk(request.giftId);
    if (!gift || gift.createdById !== actor.id) throw new HttpError(404, "Link no encontrado.");
  }
  if (request.status !== "revoked") await request.update({ status: "revoked", revokedAt: new Date() });
  return serializeRequest(request);
}

// ── Portal (comprador) ──────────────────────────────────────────────────────
const PORTAL_ERRORS = {
  invalid: [404, "Este link no es válido. Revisa que esté completo o pide uno nuevo."],
  revoked: [410, "Este link fue desactivado. Pide uno nuevo a quien te lo envió."],
  expired: [410, "Este link venció. Pide uno nuevo a quien te lo envió."],
  closed: [410, "Este regalo ya no admite cambios. Si necesitas algo, escríbele a quien te lo envió."],
};

function portalError(code) {
  const [status, message] = PORTAL_ERRORS[code];
  const error = new HttpError(status, message, { code });
  return error;
}

async function resolve(token, { allowSubmitted = false } = {}) {
  const id = verifyPortalToken(token);
  if (!id) throw portalError("invalid");
  const request = await ContentRequest.findByPk(id);
  if (!request) throw portalError("invalid");
  if (request.status === "revoked") throw portalError("revoked");
  if (request.expiresAt < new Date()) throw portalError("expired");
  if (request.status === "submitted" && !allowSubmitted) throw portalError("closed");
  const gift = await Gift.findByPk(request.giftId);
  if (!gift || !EDITABLE_GIFT_STATUSES.includes(gift.status)) {
    if (allowSubmitted && request.status === "submitted" && gift) return { request, gift };
    throw portalError("closed");
  }
  return { request, gift };
}

async function touch(request) {
  await request.update({ lastUsedAt: new Date() }, { silent: true });
}

async function portalView(token) {
  const { request, gift } = await resolve(token, { allowSubmitted: true });
  const { manifest, keys } = await customerKeysFor(gift);
  const allowed = request.allowedFields.filter((k) => keys.includes(k));
  const core = await loadGiftCore();

  const values = core.mergeBoundValues(gift.content || {}, gift);
  const scoped = Object.fromEntries(Object.entries(values).filter(([k]) => allowed.includes(k)));

  // Media visible: la referenciada en los campos permitidos + la que subió el propio comprador.
  const template = await registry.getTemplate(gift.templateId);
  const referenced = core.collectAssetIds(template.schema, scoped);
  const assets = await MediaAsset.findAll({
    where: { giftId: gift.id, status: "ready", [Op.or]: [{ id: referenced }, { uploadedBy: "customer" }] },
  });

  await touch(request);
  return {
    status: request.status,
    // Si vino de la tienda pública: precio, cómo pagar y si ya subió su comprobante.
    order: await orders.orderInfo(gift),
    expiresAt: request.expiresAt,
    template: { id: manifest.id, name: manifest.name, version: gift.templateVersion },
    // Sólo lo necesario para personalizar el mensaje de bienvenida y el formulario.
    gift: { templateId: gift.templateId, recipientName: gift.recipientName, senderName: gift.senderName, occasion: gift.occasion },
    allowedFields: allowed,
    values: scoped,
    media: assets.map(media.serializeAsset).map(({ uploadedBy, sizeBytes, ...rest }) => rest),
  };
}

async function updateContent(token, values) {
  const { request, gift } = await resolve(token);
  const { content, bound } = await contentValidation.applyContentUpdate(gift, values, { keys: request.allowedFields });
  await gift.update({ content, ...Object.fromEntries(Object.entries(bound).map(([k, v]) => [k, String(v || "").trim().slice(0, 120)])) });
  await touch(request);
  return { savedAt: new Date() };
}

async function addMedia(token, { file, expectedKind, durationSec }) {
  const { request, gift } = await resolve(token);
  const asset = await media.createFromUpload({ gift, file, uploadedBy: "customer", expectedKind, durationSec });
  await touch(request);
  const { uploadedBy, sizeBytes, ...rest } = media.serializeAsset(asset);
  return rest;
}

async function removeMedia(token, assetId) {
  const { request, gift } = await resolve(token);
  const asset = await MediaAsset.findOne({ where: { id: assetId, giftId: gift.id } });
  if (!asset) throw new HttpError(404, "Archivo no encontrado.");
  // El comprador sólo puede borrar lo que él subió; lo del admin sólo se desvincula de su campo.
  if (asset.uploadedBy === "customer") {
    await media.deleteAsset(asset);
  }
  await gift.update({ content: contentValidation.stripAssetRefs(gift.content || {}, assetId) });
  await touch(request);
}

async function submit(token) {
  const { request, gift } = await resolve(token);
  await contentValidation.assertComplete(gift, { keys: request.allowedFields, message: "Faltan algunos datos antes de enviar." });
  await sequelize.transaction(async (transaction) => {
    await request.update({ status: "submitted", submittedAt: new Date(), lastUsedAt: new Date() }, { transaction });
    const changes = {};
    if (["draft", "collecting_content"].includes(gift.status)) changes.status = "ready";
    // Pedido de la tienda pública: queda esperando que el vendedor lo acepte.
    if (gift.requestStatus === "draft") {
      changes.requestStatus = "pending";
      changes.requestedAt = new Date();
    }
    if (Object.keys(changes).length) await gift.update(changes, { transaction });
  });
  return { status: "submitted" };
}

/** Comprobante de pago del cliente final (opcional). */
async function addPaymentProof(token, file) {
  const { gift } = await resolve(token, { allowSubmitted: true });
  if (gift.requestStatus === "none") throw new HttpError(409, "Este regalo no acepta comprobantes.");
  return orders.attachClientProof(gift, file);
}

module.exports = { createRequest, listRequests, revokeRequest, portalView, updateContent, addMedia, removeMedia, submit, addPaymentProof, serializeRequest };
