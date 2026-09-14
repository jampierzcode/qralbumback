// Respuestas de visitantes a un regalo publicado. Genérico por tipo; hoy: "rsvp".
// Una plantilla sólo puede recibir los tipos que declara en manifest.collectsResponses.
const { fn, col } = require("sequelize");
const { Gift, GiftResponse } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const registry = require("./templateRegistry");

const TYPES = {
  rsvp: {
    answers: ["yes", "maybe", "no"],
    read(body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new HttpError(400, "Escribe tu nombre para confirmar.");
      if (name.length > 80) throw new HttpError(400, "El nombre es demasiado largo.");
      if (!this.answers.includes(body.answer)) throw new HttpError(400, "Elige si vas a asistir.");
      const guests = body.answer === "no" ? 0 : Number(body.guests ?? 1);
      if (!Number.isInteger(guests) || guests < 0 || guests > 20) throw new HttpError(400, "La cantidad de personas no es válida.");
      const message = typeof body.message === "string" ? body.message.trim().slice(0, 300) || null : null;
      return { name, answer: body.answer, guests, message };
    },
  },
};

async function findPublishedGift(slug) {
  const gift = await Gift.findOne({ where: { slug: String(slug), status: "published" } });
  if (!gift) throw new HttpError(404, "Este regalo no existe o todavía no está listo.");
  return gift;
}

async function createResponse(slug, body = {}) {
  const gift = await findPublishedGift(slug);
  const handler = TYPES[body.type];
  const template = await registry.getTemplate(gift.templateId);
  const allowed = template?.manifest.collectsResponses || [];
  if (!handler || !allowed.includes(body.type)) throw new HttpError(400, "Este regalo no recibe respuestas.");
  if (body.type === "rsvp" && gift.content?.rsvpEnabled === false) throw new HttpError(409, "Las confirmaciones están cerradas.");

  const data = handler.read(body);
  // Si la misma persona confirma otra vez, se actualiza su respuesta en lugar de duplicarla.
  const existing = await GiftResponse.findOne({ where: { giftId: gift.id, type: body.type, name: data.name } });
  const saved = existing ? await existing.update(data) : await GiftResponse.create({ giftId: gift.id, type: body.type, ...data });
  return { id: saved.id, updated: Boolean(existing) };
}

async function listResponses(giftId, type = "rsvp") {
  const gift = await Gift.findByPk(giftId, { attributes: ["id"] });
  if (!gift) throw new HttpError(404, "Regalo no encontrado.");
  const items = await GiftResponse.findAll({ where: { giftId, type }, order: [["updatedAt", "DESC"]] });
  const totals = await GiftResponse.findAll({
    attributes: ["answer", [fn("COUNT", col("id")), "count"], [fn("SUM", col("guests")), "guests"]],
    where: { giftId, type },
    group: ["answer"],
    raw: true,
  });
  const summary = { yes: 0, maybe: 0, no: 0, guestsYes: 0, guestsMaybe: 0 };
  for (const t of totals) {
    summary[t.answer] = Number(t.count);
    if (t.answer === "yes") summary.guestsYes = Number(t.guests);
    if (t.answer === "maybe") summary.guestsMaybe = Number(t.guests);
  }
  return {
    summary,
    items: items.map((r) => ({ id: r.id, name: r.name, answer: r.answer, guests: r.guests, message: r.message, createdAt: r.createdAt, updatedAt: r.updatedAt })),
  };
}

async function deleteResponse(giftId, id) {
  const deleted = await GiftResponse.destroy({ where: { giftId, id } });
  if (!deleted) throw new HttpError(404, "Respuesta no encontrada.");
}

module.exports = { createResponse, listResponses, deleteResponse };
