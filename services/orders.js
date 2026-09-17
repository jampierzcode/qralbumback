// Tienda pública de cada vendedor: /pedir/<handle>.
// El cliente final elige su regalo, lo arma en el portal de siempre, ve cómo pagar y envía
// su solicitud. El vendedor la acepta; el link recién sale con las aprobaciones de siempre.
const crypto = require("crypto");
const { Op } = require("sequelize");
const { User, Gift, Customer, ContentRequest, MediaAsset, sequelize } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { optionalString, requiredString } = require("../utils/input");
const { slugify } = require("../utils/slugify");
const { randomSlug } = require("../utils/slug");
const { signPortalToken } = require("../utils/portalToken");
const registry = require("./templateRegistry");
const { loadGiftCore } = require("./giftCore");
const sellers = require("./sellers");
const media = require("./media");

const DAY = 24 * 60 * 60 * 1000;
const ORDER_DAYS = 14;

async function uniqueHandle(base, userId) {
  let candidate = slugify(base).slice(0, 32) || "vendedor";
  for (let i = 0; i < 20; i++) {
    const taken = await User.findOne({ where: { handle: candidate, id: { [Op.ne]: userId || 0 } } });
    if (!taken) return candidate;
    candidate = `${slugify(base).slice(0, 28)}-${i + 2}`;
  }
  return `${candidate}-${crypto.randomInt(1000)}`;
}

function serializeStoreSettings(user) {
  return {
    handle: user.handle,
    publicName: user.publicName || user.name,
    publicMessage: user.publicMessage,
    ordersEnabled: user.ordersEnabled,
    phone: user.phone,
  };
}

/** Ajustes de la tienda del vendedor que entró. */
async function getStore(userId) {
  const user = await User.findByPk(userId);
  if (!user.handle) await user.update({ handle: await uniqueHandle(user.name, user.id) });
  return serializeStoreSettings(user);
}

async function updateStore(userId, body = {}) {
  const user = await User.findByPk(userId);
  const changes = {};
  if (body.handle !== undefined) {
    const wanted = slugify(requiredString(body.handle, { field: "handle", label: "El link", max: 40 }));
    if (wanted.length < 3) throw new HttpError(400, "El link debe tener al menos 3 letras.");
    const taken = await User.findOne({ where: { handle: wanted, id: { [Op.ne]: userId } } });
    if (taken) throw new HttpError(409, "Ese link ya está tomado. Prueba con otro.");
    changes.handle = wanted;
  }
  if (body.publicName !== undefined) changes.publicName = optionalString(body.publicName, { field: "publicName", max: 120 }) || null;
  if (body.publicMessage !== undefined) changes.publicMessage = optionalString(body.publicMessage, { field: "publicMessage", max: 300 }) || null;
  if (body.ordersEnabled !== undefined) changes.ordersEnabled = Boolean(body.ordersEnabled);
  // Siempre hay link: si nunca se abrió la tienda, se genera desde su nombre.
  if (!user.handle && !changes.handle) changes.handle = await uniqueHandle(user.name, user.id);
  await user.update(changes);
  return serializeStoreSettings(user);
}

async function findSellerOr404(handle) {
  const seller = await User.findOne({ where: { handle: String(handle || "").toLowerCase(), isActive: true } });
  if (!seller || !seller.ordersEnabled) throw new HttpError(404, "Esta tienda no está disponible.");
  return seller;
}

/** Lo que ve el cliente final: quién vende, qué ofrece y a qué precio. */
async function publicStore(handle) {
  const seller = await findSellerOr404(handle);
  const catalog = await sellers.catalogFor(seller.id);
  const templates = await registry.getTemplates();

  return {
    seller: {
      handle: seller.handle,
      name: seller.publicName || seller.name,
      message: seller.publicMessage,
    },
    // Sólo lo que tiene precio puesto: el cliente siempre ve cuánto cuesta.
    items: catalog
      .filter((t) => t.salePrice !== null && t.salePrice !== undefined)
      .map((t) => {
        const manifest = templates.get(t.templateId)?.manifest;
        return {
          templateId: t.templateId,
          name: t.name,
          description: t.description,
          price: t.salePrice,
          occasions: manifest?.occasions || [],
        };
      }),
  };
}

/** El cliente elige plantilla y deja su nombre: se crea su regalo en borrador y su link del portal. */
async function startOrder(handle, body = {}) {
  const seller = await findSellerOr404(handle);
  const templateId = String(body.templateId || "");
  const store = await publicStore(handle);
  const item = store.items.find((i) => i.templateId === templateId);
  if (!item) throw new HttpError(400, "Elige uno de los regalos disponibles.");

  const name = requiredString(body.name, { field: "name", label: "Tu nombre", max: 120 });
  const phone = optionalString(body.phone, { field: "phone", max: 40 });
  if (!phone || phone.replace(/\D/g, "").length < 6) throw new HttpError(400, "Escribe tu WhatsApp para poder responderte.");

  const template = await registry.getTemplate(templateId);
  const { getCustomerEditableKeys } = await loadGiftCore();
  const allowedFields = getCustomerEditableKeys(template.schema);

  const { gift, request } = await sequelize.transaction(async (transaction) => {
    const customer = await Customer.create({ name, phone, createdById: seller.id }, { transaction });
    let slug = randomSlug();
    while (await Gift.count({ where: { slug }, transaction })) slug = randomSlug();

    const created = await Gift.create(
      {
        id: crypto.randomUUID(),
        slug,
        customerId: customer.id,
        createdById: seller.id,
        templateId,
        templateVersion: template.manifest.version || 1,
        status: "collecting_content",
        content: {},
        settings: {},
        salePrice: item.price,
        requestStatus: "draft",
        requesterName: name,
        requesterPhone: phone,
      },
      { transaction }
    );
    const contentRequest = await ContentRequest.create(
      {
        id: crypto.randomUUID(),
        giftId: created.id,
        status: "active",
        allowedFields,
        expiresAt: new Date(Date.now() + ORDER_DAYS * DAY),
      },
      { transaction }
    );
    return { gift: created, request: contentRequest };
  });

  return { token: signPortalToken(request.id), giftId: gift.id };
}

/** Datos de pago y precio que ve el cliente al final del portal. */
async function orderInfo(gift) {
  if (gift.requestStatus === "none") return null;
  const seller = gift.createdById ? await User.findByPk(gift.createdById) : null;
  return {
    status: gift.requestStatus,
    price: gift.salePrice === null || gift.salePrice === undefined ? null : Number(gift.salePrice),
    currency: gift.currency,
    sellerName: seller ? seller.publicName || seller.name : null,
    sellerPhone: seller?.phone || null,
    methods: seller ? await sellers.listMethods(seller.id, { activeOnly: true }) : [],
    hasProof: Boolean(gift.clientProofAssetId),
    requestedAt: gift.requestedAt,
  };
}

/** Comprobante del cliente final (opcional): acelera la aprobación de su vendedor. */
async function attachClientProof(gift, file) {
  const asset = await media.createFromUpload({ gift, file, uploadedBy: "customer", expectedKind: "image" });
  const previous = gift.clientProofAssetId;
  await gift.update({ clientProofAssetId: asset.id });
  if (previous) {
    const old = await MediaAsset.findByPk(previous);
    if (old) await media.deleteAsset(old);
  }
  return { hasProof: true };
}

/** El comprobante que subió el cliente final (lo ve su vendedor). */
async function clientProof(giftId, actor = null) {
  const gifts = require("./gifts");
  const gift = gifts.assertOwnership(await gifts.findGiftOr404(giftId), actor);
  const asset = gift.clientProofAssetId ? await MediaAsset.findByPk(gift.clientProofAssetId) : null;
  if (!asset) throw new HttpError(404, "Este pedido no tiene comprobante.");
  return media.serializeAsset(asset);
}

/** El vendedor acepta o rechaza el pedido de su cliente. */
async function reviewOrder(giftId, body = {}, actor = null) {
  const gifts = require("./gifts");
  const gift = gifts.assertOwnership(await gifts.findGiftOr404(giftId), actor);
  if (!["pending", "accepted", "rejected"].includes(gift.requestStatus)) {
    throw new HttpError(409, "Este regalo no es un pedido.");
  }
  const note = optionalString(body.note, { field: "note", max: 300 }) || null;
  if (body.action === "reject") {
    await gift.update({ requestStatus: "rejected", requestNote: note });
  } else if (body.action === "accept") {
    await gift.update({ requestStatus: "accepted", requestNote: note, status: gift.status === "published" ? gift.status : "ready" });
  } else {
    throw new HttpError(400, "Acción inválida.");
  }
  return gifts.getGift(gift.id, actor);
}

module.exports = {
  clientProof,
  getStore,
  updateStore,
  publicStore,
  startOrder,
  orderInfo,
  attachClientProof,
  reviewOrder,
  uniqueHandle,
};
