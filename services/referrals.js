// Referidos: cuentas que crean regalos, te los pagan (Yape) y recién ahí pueden compartirlos.
// El precio de cada regalo sale de la plantilla (TemplateListings.referralPrice) y queda congelado
// en el regalo al enviarlo a aprobación, para que un cambio de precios no altere lo ya vendido.
const bcrypt = require("bcryptjs");
const { fn, col, literal } = require("sequelize");
const { Gift, User, TemplateListing, MediaAsset } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { optionalString } = require("../utils/input");
const gifts = require("./gifts");
const contentValidation = require("./contentValidation");
const media = require("./media");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function money(value) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeReferral(user, totals = {}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    gifts: totals.gifts || 0,
    pending: totals.pending || 0,
    approved: totals.approved || 0,
    owed: totals.owed || 0,
    paid: totals.paid || 0,
    sold: totals.sold || 0,
    earned: totals.earned || 0,
  };
}

async function totalsByReferral(where = {}) {
  const rows = await Gift.findAll({
    attributes: [
      "createdById",
      [fn("COUNT", col("id")), "gifts"],
      [fn("SUM", literal("reviewStatus = 'pending'")), "pending"],
      [fn("SUM", literal("reviewStatus = 'approved'")), "approved"],
      [fn("SUM", literal("CASE WHEN reviewStatus = 'approved' AND paidAt IS NULL THEN price ELSE 0 END")), "owed"],
      [fn("SUM", literal("CASE WHEN paidAt IS NOT NULL THEN price ELSE 0 END")), "paid"],
      // Ventas del referido: lo que le cobró a sus clientes y lo que le quedó.
      [fn("SUM", literal("CASE WHEN reviewStatus = 'approved' THEN salePrice ELSE 0 END")), "sold"],
      [fn("SUM", literal("CASE WHEN reviewStatus = 'approved' AND salePrice IS NOT NULL THEN salePrice - COALESCE(price, 0) ELSE 0 END")), "earned"],
    ],
    where,
    group: ["createdById"],
    raw: true,
  });
  const map = new Map();
  for (const r of rows) {
    map.set(r.createdById, {
      gifts: Number(r.gifts),
      pending: Number(r.pending || 0),
      approved: Number(r.approved || 0),
      owed: Number(r.owed || 0),
      paid: Number(r.paid || 0),
      sold: Number(r.sold || 0),
      earned: Number(r.earned || 0),
    });
  }
  return map;
}

async function listReferrals() {
  const users = await User.findAll({ where: { role: "referido" }, order: [["name", "ASC"]] });
  const totals = await totalsByReferral();
  return { items: users.map((u) => serializeReferral(u, totals.get(u.id))) };
}

async function createReferral(body = {}) {
  const name = optionalString(body.name, { field: "name", max: 120 });
  const email = optionalString(body.email, { field: "email", max: 160 })?.toLowerCase();
  const phone = optionalString(body.phone, { field: "phone", max: 40 });
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) throw new HttpError(400, "Escribe el nombre del referido.");
  if (!email || !EMAIL.test(email)) throw new HttpError(400, "Escribe un correo válido.");
  if (password.length < 8) throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.");
  if (await User.count({ where: { email } })) throw new HttpError(409, "Ya existe una cuenta con ese correo.");

  const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 10), role: "referido" });
  return serializeReferral(user);
}

async function findReferralOr404(id) {
  const user = await User.findOne({ where: { id, role: "referido" } });
  if (!user) throw new HttpError(404, "Referido no encontrado.");
  return user;
}

async function updateReferral(id, body = {}) {
  const user = await findReferralOr404(id);
  const changes = {};
  if (body.name !== undefined) changes.name = optionalString(body.name, { field: "name", max: 120 }) || user.name;
  if (body.phone !== undefined) changes.phone = optionalString(body.phone, { field: "phone", max: 40 });
  if (body.isActive !== undefined) changes.isActive = Boolean(body.isActive);
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.");
    }
    changes.password = await bcrypt.hash(body.password, 10);
  }
  await user.update(changes);
  return serializeReferral(user, (await totalsByReferral({ createdById: user.id })).get(user.id));
}

// Precio que el referido debe pagar por un regalo de esta plantilla.
async function priceFor(templateId) {
  const listing = await TemplateListing.findOne({ where: { templateId } });
  return money(listing?.referralPrice);
}

/** El referido envía su regalo a aprobación (te lo pagó por Yape). */
async function submitForReview(giftId, body = {}, actor = null) {
  const gift = gifts.assertOwnership(await gifts.findGiftOr404(giftId), actor);
  if (gift.reviewStatus === "pending") throw new HttpError(409, "Este regalo ya está esperando aprobación.");
  if (gift.reviewStatus === "approved") throw new HttpError(409, "Este regalo ya está aprobado.");
  // Se revisa completo: al aprobarlo se publica de inmediato.
  await contentValidation.assertComplete(gift);

  const salePrice = body.salePrice === undefined || body.salePrice === "" ? gift.salePrice : money(body.salePrice);
  if (salePrice !== null && salePrice !== undefined && (!Number.isFinite(salePrice) || salePrice < 0)) {
    throw new HttpError(400, "Precio de venta inválido.");
  }

  await gift.update({
    salePrice,
    reviewStatus: "pending",
    submittedAt: new Date(),
    reviewNote: optionalString(body.note, { field: "note", max: 300 }) || null,
    price: gift.price ?? (await priceFor(gift.templateId)),
    status: gift.status === "draft" || gift.status === "collecting_content" ? "ready" : gift.status,
  });
  return gifts.getGift(gift.id, actor);
}

/** Comprobante de pago (opcional): una imagen que queda fuera del contenido del regalo. */
async function attachPaymentProof(giftId, file, actor = null) {
  const gift = gifts.assertOwnership(await gifts.findGiftOr404(giftId), actor);
  const asset = await media.createFromUpload({ gift, file, uploadedBy: "referral", expectedKind: "image" });
  const previous = gift.paymentProofAssetId;
  await gift.update({ paymentProofAssetId: asset.id });
  if (previous) {
    const old = await MediaAsset.findByPk(previous);
    if (old) await media.deleteAsset(old);
  }
  return gifts.getGift(gift.id, actor);
}

async function getPaymentProof(giftId, actor = null) {
  const gift = gifts.assertOwnership(await gifts.findGiftOr404(giftId), actor);
  if (!gift.paymentProofAssetId) throw new HttpError(404, "Este regalo no tiene comprobante.");
  const asset = await MediaAsset.findByPk(gift.paymentProofAssetId);
  if (!asset) throw new HttpError(404, "Este regalo no tiene comprobante.");
  return media.serializeAsset(asset);
}

/**
 * Apruebas o rechazas. Al aprobar, el regalo se publica y el referido ya ve link y QR.
 * Con `paid: true` se registra el pago en el mismo paso (no hay que marcarlo después).
 */
async function review(giftId, body = {}, actor = null) {
  const action = body.action;
  if (!["approve", "reject"].includes(action)) throw new HttpError(400, "Acción inválida.");
  const gift = await gifts.findGiftOr404(giftId);
  const note = optionalString(body.note, { field: "note", max: 300 }) || null;

  if (action === "reject") {
    await gift.update({ reviewStatus: "rejected", reviewedAt: new Date(), reviewedById: actor?.id ?? null, reviewNote: note });
    return gifts.getGift(gift.id);
  }

  await contentValidation.assertComplete(gift);
  // DECIMAL vuelve de MySQL como texto: siempre se normaliza a número.
  const price = money(body.price === undefined ? gift.price ?? (await priceFor(gift.templateId)) : body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new HttpError(400, "Precio inválido.");

  await gift.update({
    reviewStatus: "approved",
    reviewedAt: new Date(),
    reviewedById: actor?.id ?? null,
    reviewNote: note,
    price,
    paidAt: body.paid === true ? gift.paidAt || new Date() : body.paid === false ? null : gift.paidAt,
    status: "published",
    publishedAt: gift.publishedAt || new Date(),
    archivedAt: null,
  });
  return gifts.getGift(gift.id);
}

/** Marcas un regalo como pagado (o lo desmarcas). */
async function setPaid(giftId, paid) {
  const gift = await gifts.findGiftOr404(giftId);
  await gift.update({ paidAt: paid ? gift.paidAt || new Date() : null });
  return gifts.getGift(gift.id);
}

/** Resumen de cuenta de un referido (lo usa él y también tú). */
async function account(referralId) {
  const totals = (await totalsByReferral({ createdById: referralId })).get(referralId) || {};
  const unpaid = await Gift.findAll({
    where: { createdById: referralId, reviewStatus: "approved", paidAt: null },
    order: [["reviewedAt", "ASC"]],
  });
  const pending = await Gift.findAll({
    where: { createdById: referralId, reviewStatus: "pending" },
    order: [["submittedAt", "ASC"]],
  });
  return {
    summary: {
      gifts: totals.gifts || 0,
      pending: totals.pending || 0,
      approved: totals.approved || 0,
      owed: totals.owed || 0,
      paid: totals.paid || 0,
      sold: totals.sold || 0,
      earned: totals.earned || 0,
      currency: "PEN",
    },
    unpaidGifts: unpaid.map((g) => gifts.serializeGift(g)),
    pendingGifts: pending.map((g) => gifts.serializeGift(g)),
  };
}

module.exports = {
  listReferrals,
  createReferral,
  updateReferral,
  submitForReview,
  attachPaymentProof,
  getPaymentProof,
  review,
  setPaid,
  account,
  priceFor,
};
