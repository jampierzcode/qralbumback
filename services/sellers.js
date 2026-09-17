// El "negocio" de cada vendedor: con qué le pagan y a cuánto vende cada plantilla.
// El dueño (superadmin/admin) también es un vendedor: sus datos de pago son los que
// ven sus referidos para pagarle lo que deben.
const { Op } = require("sequelize");
const { User, PaymentMethod, SellerTemplatePrice, TemplateListing } = require("../models");
const { PAYMENT_TYPES } = require("../models/PaymentMethod");
const { HttpError } = require("../middleware/errorHandler");
const { optionalString, requiredString } = require("../utils/input");
const registry = require("./templateRegistry");

const TYPE_LABELS = { yape: "Yape", plin: "Plin", bim: "BIM", transfer: "Transferencia" };

function serializeMethod(m) {
  return {
    id: m.id,
    type: m.type,
    typeLabel: TYPE_LABELS[m.type],
    holder: m.holder,
    reference: m.reference,
    bank: m.bank,
    notes: m.notes,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
  };
}

function readMethod(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body.type !== undefined) {
    if (!PAYMENT_TYPES.includes(body.type)) throw new HttpError(400, "Elige Yape, Plin, BIM o transferencia.");
    data.type = body.type;
  }
  if (!partial || body.reference !== undefined) {
    data.reference = requiredString(body.reference, { field: "reference", label: "El número o cuenta", max: 120 });
  }
  if (body.holder !== undefined) data.holder = optionalString(body.holder, { field: "holder", max: 120 }) || null;
  if (body.bank !== undefined) data.bank = optionalString(body.bank, { field: "bank", max: 80 }) || null;
  if (body.notes !== undefined) data.notes = optionalString(body.notes, { field: "notes", max: 200 }) || null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
  return data;
}

async function listMethods(userId, { activeOnly = false } = {}) {
  const where = { userId, ...(activeOnly ? { isActive: true } : {}) };
  const rows = await PaymentMethod.findAll({ where, order: [["sortOrder", "ASC"], ["id", "ASC"]] });
  return rows.map(serializeMethod);
}

async function createMethod(userId, body = {}) {
  const count = await PaymentMethod.count({ where: { userId } });
  if (count >= 8) throw new HttpError(400, "Ya tienes demasiados medios de pago.");
  const method = await PaymentMethod.create({ ...readMethod(body), userId, sortOrder: count });
  return serializeMethod(method);
}

async function findMethodOr404(userId, id) {
  const method = await PaymentMethod.findOne({ where: { id, userId } });
  if (!method) throw new HttpError(404, "Medio de pago no encontrado.");
  return method;
}

async function updateMethod(userId, id, body = {}) {
  const method = await findMethodOr404(userId, id);
  await method.update(readMethod(body, { partial: true }));
  return serializeMethod(method);
}

async function deleteMethod(userId, id) {
  await (await findMethodOr404(userId, id)).destroy();
}

/** Los datos de pago del dueño: los ve el referido para pagarle lo que debe. */
async function ownerMethods() {
  const owner = await User.findOne({ where: { role: { [Op.in]: ["superadmin", "admin"] }, isActive: true }, order: [["id", "ASC"]] });
  if (!owner) return { owner: null, methods: [] };
  return { owner: { name: owner.name, phone: owner.phone }, methods: await listMethods(owner.id, { activeOnly: true }) };
}

/** Catálogo del vendedor: cuánto le cuesta cada plantilla y a cuánto la vende. */
async function catalogFor(userId) {
  const templates = await registry.getTemplates();
  const listings = await TemplateListing.findAll({ where: { isActive: true }, order: [["sortOrder", "ASC"]] });
  const prices = await SellerTemplatePrice.findAll({ where: { userId } });
  const byTemplate = new Map(prices.map((p) => [p.templateId, p.salePrice === null ? null : Number(p.salePrice)]));

  return listings
    .filter((l) => templates.has(l.templateId))
    .map((listing) => {
      const manifest = templates.get(listing.templateId).manifest;
      return {
        templateId: listing.templateId,
        name: listing.name || manifest.name,
        description: listing.description ?? manifest.description,
        cost: listing.referralPrice === null || listing.referralPrice === undefined ? null : Number(listing.referralPrice),
        salePrice: byTemplate.has(listing.templateId) ? byTemplate.get(listing.templateId) : null,
      };
    });
}

async function setSalePrice(userId, templateId, salePrice) {
  const templates = await registry.getTemplates();
  if (!templates.has(templateId)) throw new HttpError(404, "Plantilla no encontrada.");
  let value = null;
  if (salePrice !== null && salePrice !== undefined && salePrice !== "") {
    value = Number(salePrice);
    if (!Number.isFinite(value) || value < 0 || value > 99999) throw new HttpError(400, "Precio inválido.");
  }
  const [row] = await SellerTemplatePrice.findOrCreate({ where: { userId, templateId }, defaults: { salePrice: value } });
  if (row.salePrice !== value) await row.update({ salePrice: value });
  return catalogFor(userId);
}

/** Precio con el que se precarga un regalo nuevo de este vendedor. */
async function salePriceFor(userId, templateId) {
  if (!userId) return null;
  const row = await SellerTemplatePrice.findOne({ where: { userId, templateId } });
  return row?.salePrice === null || row?.salePrice === undefined ? null : Number(row.salePrice);
}

module.exports = {
  TYPE_LABELS,
  listMethods,
  createMethod,
  updateMethod,
  deleteMethod,
  ownerMethods,
  catalogFor,
  setSalePrice,
  salePriceFor,
};
