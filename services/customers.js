const { Op, fn, col, literal } = require("sequelize");
const { Customer, Gift, GiftEvent, ContentRequest } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { requiredString, optionalString } = require("../utils/input");
const { serializeGift, isReferral } = require("./gifts");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(value) {
  const phone = optionalString(value, { field: "phone", max: 32 });
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 6) throw new HttpError(400, "El número de WhatsApp no parece válido.");
  return cleaned;
}

function readCustomer(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body.name !== undefined) data.name = requiredString(body.name, { field: "name", label: "El nombre", max: 120 });
  if (body.phone !== undefined) data.phone = normalizePhone(body.phone);
  if (body.email !== undefined) {
    const email = optionalString(body.email, { field: "email", max: 160 }) || null;
    if (email && !EMAIL.test(email)) throw new HttpError(400, "El email no parece válido.");
    data.email = email;
  }
  if (body.notes !== undefined) data.notes = optionalString(body.notes, { field: "notes", max: 2000 }) || null;
  return data;
}

function serializeCustomer(c) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    isLegacy: Boolean(c.legacyUserId),
    giftsCount: c.get("giftsCount") !== undefined ? Number(c.get("giftsCount")) : undefined,
    lastGiftAt: c.get("lastGiftAt") || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function listCustomers(query = {}, actor = null) {
  const where = {};
  if (isReferral(actor)) where.createdById = actor.id;
  if (query.q) {
    const like = { [Op.like]: `%${String(query.q).trim()}%` };
    where[Op.or] = [{ name: like }, { phone: like }, { email: like }];
  }
  const rows = await Customer.findAll({
    where,
    attributes: {
      include: [
        [literal("(SELECT COUNT(*) FROM Gifts g WHERE g.customerId = Customer.id AND g.status <> 'archived')"), "giftsCount"],
        [literal("(SELECT MAX(g.createdAt) FROM Gifts g WHERE g.customerId = Customer.id)"), "lastGiftAt"],
      ],
    },
    order: [["createdAt", "DESC"]],
    limit: Math.min(500, Number(query.limit) || 200),
  });
  return rows.map(serializeCustomer);
}

async function createCustomer(body = {}, actor = null) {
  const customer = await Customer.create({ ...readCustomer(body), createdById: actor?.id ?? null });
  return serializeCustomer(customer);
}

async function updateCustomer(id, body = {}, actor = null) {
  const customer = await findCustomerOr404(id, actor);
  await customer.update(readCustomer(body, { partial: true }));
  return serializeCustomer(customer);
}

// Un referido sólo ve los clientes que él registró.
async function findCustomerOr404(id, actor) {
  const customer = await Customer.findByPk(id);
  if (!customer || (isReferral(actor) && customer.createdById !== actor.id)) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  return customer;
}

async function getCustomer(id, actor = null) {
  const customer = await findCustomerOr404(id, actor);

  const giftScope = isReferral(actor) ? { customerId: id, createdById: actor.id } : { customerId: id };
  const gifts = await Gift.findAll({ where: giftScope, order: [["updatedAt", "DESC"]] });
  const giftIds = gifts.map((g) => g.id);

  // Actividad: línea de tiempo simple construida desde fechas y eventos.
  const activity = [];
  for (const g of gifts) {
    const who = g.recipientName ? `para ${g.recipientName}` : "";
    activity.push({ type: "gift_created", at: g.createdAt, giftId: g.id, text: `Regalo creado ${who}`.trim() });
    if (g.publishedAt) activity.push({ type: "gift_published", at: g.publishedAt, giftId: g.id, text: `Regalo publicado ${who}`.trim() });
  }
  if (giftIds.length) {
    const submitted = await ContentRequest.findAll({ where: { giftId: giftIds, submittedAt: { [Op.ne]: null } } });
    submitted.forEach((r) =>
      activity.push({ type: "content_submitted", at: r.submittedAt, giftId: r.giftId, text: "Envió su contenido" })
    );
    const opens = await GiftEvent.findAll({
      attributes: ["giftId", [fn("COUNT", col("id")), "count"], [fn("MAX", col("createdAt")), "lastAt"]],
      where: { giftId: giftIds, type: "opened" },
      group: ["giftId"],
      raw: true,
    });
    opens.forEach((o) =>
      activity.push({ type: "gift_opened", at: o.lastAt, giftId: o.giftId, text: `Regalo abierto ${o.count} ${Number(o.count) === 1 ? "vez" : "veces"}` })
    );
  }
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    ...serializeCustomer(customer),
    giftsCount: gifts.filter((g) => g.status !== "archived").length,
    gifts: gifts.map((g) => serializeGift(g, { actor })),
    activity: activity.slice(0, 50),
  };
}

module.exports = { listCustomers, createCustomer, updateCustomer, getCustomer };
