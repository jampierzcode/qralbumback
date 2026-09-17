// Catálogo comercial: plantillas (listings) y colecciones.
const crypto = require("crypto");
const sharp = require("sharp");
const { Op } = require("sequelize");
const { Collection, TemplateListing, CollectionTemplate, Gift, sequelize } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { requiredString, optionalString } = require("../utils/input");
const { slugify } = require("../utils/slugify");
const registry = require("./templateRegistry");
const storage = require("./storage");

// ── Sincronización ──────────────────────────────────────────────────────────
// Crea listings para plantillas nuevas del repositorio y las agrega a sus
// colecciones sugeridas (manifest.defaultCollections). Nunca pisa ediciones del admin.
async function syncTemplateListings() {
  const templates = await registry.getTemplates();
  const existing = new Set((await TemplateListing.findAll({ attributes: ["templateId"] })).map((l) => l.templateId));
  let order = await TemplateListing.count();
  const created = [];

  for (const { manifest } of templates.values()) {
    if (existing.has(manifest.id)) continue;
    const listing = await TemplateListing.create({ templateId: manifest.id, isActive: true, sortOrder: order++ });
    created.push(manifest.id);

    const slugs = manifest.defaultCollections || [];
    if (!slugs.length) continue;
    const collections = await Collection.findAll({ where: { slug: slugs } });
    for (const collection of collections) {
      const position = await CollectionTemplate.count({ where: { collectionId: collection.id } });
      await CollectionTemplate.findOrCreate({
        where: { collectionId: collection.id, templateListingId: listing.id },
        defaults: { sortOrder: position },
      });
    }
  }
  return created;
}

// ── Plantillas ──────────────────────────────────────────────────────────────
async function listTemplates() {
  const templates = await registry.getTemplates();
  const listings = await TemplateListing.findAll({
    include: [{ model: Collection, as: "collections", attributes: ["id", "name", "slug"], through: { attributes: [] } }],
    order: [["sortOrder", "ASC"], ["id", "ASC"]],
  });
  const usage = await Gift.findAll({
    attributes: ["templateId", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    where: { status: { [Op.ne]: "archived" } },
    group: ["templateId"],
    raw: true,
  });
  const usageById = Object.fromEntries(usage.map((u) => [u.templateId, Number(u.count)]));

  return listings.map((listing) => {
    const entry = templates.get(listing.templateId);
    const manifest = entry ? registry.publicManifest(entry.manifest) : null;
    return {
      templateId: listing.templateId,
      available: Boolean(entry), // false si el código de la plantilla ya no existe
      name: listing.name || manifest?.name || listing.templateId,
      description: listing.description ?? manifest?.description ?? "",
      nameOverride: listing.name,
      descriptionOverride: listing.description,
      manifest,
      isActive: listing.isActive,
      sortOrder: listing.sortOrder,
      referralPrice: listing.referralPrice === null || listing.referralPrice === undefined ? null : Number(listing.referralPrice),
      collections: listing.collections.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      giftsCount: usageById[listing.templateId] || 0,
    };
  });
}

async function updateTemplate(templateId, body = {}) {
  const listing = await TemplateListing.findOne({ where: { templateId } });
  if (!listing) throw new HttpError(404, "Plantilla no encontrada.");
  const changes = {};
  if (body.name !== undefined) changes.name = optionalString(body.name, { field: "name", max: 120 }) || null;
  if (body.description !== undefined)
    changes.description = optionalString(body.description, { field: "description", max: 1000 }) || null;
  if (body.isActive !== undefined) changes.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined) changes.sortOrder = Number(body.sortOrder) || 0;
  if (body.referralPrice !== undefined) {
    if (body.referralPrice === null || body.referralPrice === "") changes.referralPrice = null;
    else {
      const price = Number(body.referralPrice);
      if (!Number.isFinite(price) || price < 0 || price > 99999) throw new HttpError(400, "Precio inválido.");
      changes.referralPrice = price;
    }
  }
  await listing.update(changes);
  return (await listTemplates()).find((t) => t.templateId === templateId);
}

async function reorderTemplates(templateIds) {
  if (!Array.isArray(templateIds)) throw new HttpError(400, "Envía la lista ordenada de plantillas.");
  await sequelize.transaction(async (transaction) => {
    for (const [index, templateId] of templateIds.entries()) {
      await TemplateListing.update({ sortOrder: index }, { where: { templateId }, transaction });
    }
  });
  return listTemplates();
}

// ── Colecciones ─────────────────────────────────────────────────────────────
async function serializeCollection(collection) {
  const rows = await CollectionTemplate.findAll({
    where: { collectionId: collection.id },
    order: [["sortOrder", "ASC"]],
  });
  const listings = await TemplateListing.findAll({ where: { id: rows.map((r) => r.templateListingId) } });
  const byId = Object.fromEntries(listings.map((l) => [l.id, l]));
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    coverUrl: collection.coverUrl,
    isActive: collection.isActive,
    sortOrder: collection.sortOrder,
    templateIds: rows.map((r) => byId[r.templateListingId]?.templateId).filter(Boolean),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

async function findCollectionOr404(id) {
  const collection = await Collection.findByPk(id);
  if (!collection) throw new HttpError(404, "Colección no encontrada.");
  return collection;
}

async function listCollections({ activeOnly = false } = {}) {
  const collections = await Collection.findAll({
    where: activeOnly ? { isActive: true } : {},
    order: [["sortOrder", "ASC"], ["id", "ASC"]],
  });
  return Promise.all(collections.map(serializeCollection));
}

async function uniqueCollectionSlug(base, excludeId) {
  const root = slugify(base) || "coleccion";
  let candidate = root;
  for (let i = 2; ; i++) {
    const where = { slug: candidate, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) };
    if (!(await Collection.count({ where }))) return candidate;
    candidate = `${root}-${i}`;
  }
}

async function createCollection(body = {}) {
  const name = requiredString(body.name, { field: "name", label: "El nombre", max: 120 });
  const collection = await Collection.create({
    name,
    slug: await uniqueCollectionSlug(body.slug || name),
    description: optionalString(body.description, { field: "description", max: 1000 }) || null,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) || 0 : await Collection.count(),
  });
  if (Array.isArray(body.templateIds)) await setCollectionTemplates(collection.id, body.templateIds);
  return serializeCollection(collection);
}

async function updateCollection(id, body = {}) {
  const collection = await findCollectionOr404(id);
  const changes = {};
  if (body.name !== undefined) changes.name = requiredString(body.name, { field: "name", label: "El nombre", max: 120 });
  if (body.slug !== undefined) changes.slug = await uniqueCollectionSlug(body.slug, collection.id);
  if (body.description !== undefined)
    changes.description = optionalString(body.description, { field: "description", max: 1000 }) || null;
  if (body.isActive !== undefined) changes.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined) changes.sortOrder = Number(body.sortOrder) || 0;
  await collection.update(changes);
  return serializeCollection(collection);
}

async function setCollectionTemplates(id, templateIds) {
  const collection = await findCollectionOr404(id);
  if (!Array.isArray(templateIds)) throw new HttpError(400, "Envía la lista ordenada de plantillas.");
  const unique = [...new Set(templateIds)];
  const listings = await TemplateListing.findAll({ where: { templateId: unique } });
  if (listings.length !== unique.length) throw new HttpError(400, "Alguna plantilla no existe.");
  const byTemplateId = Object.fromEntries(listings.map((l) => [l.templateId, l]));

  await sequelize.transaction(async (transaction) => {
    await CollectionTemplate.destroy({ where: { collectionId: collection.id }, transaction });
    for (const [index, templateId] of unique.entries()) {
      await CollectionTemplate.create(
        { collectionId: collection.id, templateListingId: byTemplateId[templateId].id, sortOrder: index },
        { transaction }
      );
    }
  });
  return serializeCollection(collection);
}

async function reorderCollections(ids) {
  if (!Array.isArray(ids)) throw new HttpError(400, "Envía la lista ordenada de colecciones.");
  await sequelize.transaction(async (transaction) => {
    for (const [index, id] of ids.entries()) {
      await Collection.update({ sortOrder: index }, { where: { id }, transaction });
    }
  });
  return listCollections();
}

async function setCollectionCover(id, file) {
  const collection = await findCollectionOr404(id);
  if (!file) throw new HttpError(400, "Selecciona una imagen de portada.");
  const folder = `collections/${collection.id}-${crypto.randomUUID()}`;
  try {
    const data = await sharp(file.path, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1200, fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
    await storage.writeBuffer(`${folder}/cover.webp`, data);
  } catch {
    throw new HttpError(415, "No pudimos leer esta imagen. Prueba con una JPG o PNG.");
  }
  const previous = collection.coverStorageKey;
  await collection.update({ coverUrl: storage.publicUrl(`${folder}/cover.webp`), coverStorageKey: folder });
  if (previous) await storage.removeFolder(previous).catch(() => {});
  return serializeCollection(collection);
}

// Colecciones iniciales (idempotente por slug).
const DEFAULT_COLLECTIONS = [
  { slug: "amor", name: "Amor", description: "Cartas, historias y detalles para decir te amo." },
  { slug: "flores", name: "Flores", description: "Ramos y jardines digitales que no se marchitan." },
  { slug: "cumpleanos", name: "Cumpleaños", description: "Sorpresas para celebrar un año más." },
  { slug: "aniversario", name: "Aniversario", description: "Para celebrar el tiempo juntos." },
  { slug: "amistad", name: "Amistad", description: "Para esa persona que siempre está." },
  { slug: "boda", name: "Boda", description: "Invitaciones digitales para el gran día: ceremonia, confirmaciones y recuerdos." },
  { slug: "save-the-date", name: "Save the date", description: "Para apartar la fecha mucho antes de la invitación." },
];

async function seedDefaultCollections() {
  for (const [index, data] of DEFAULT_COLLECTIONS.entries()) {
    await Collection.findOrCreate({ where: { slug: data.slug }, defaults: { ...data, sortOrder: index, isActive: true } });
  }
  // Asigna plantillas existentes a sus colecciones sugeridas si aún no tienen ninguna asignación.
  const templates = await registry.getTemplates();
  for (const { manifest } of templates.values()) {
    const listing = await TemplateListing.findOne({ where: { templateId: manifest.id } });
    if (!listing) continue;
    if (await CollectionTemplate.count({ where: { templateListingId: listing.id } })) continue;
    const collections = await Collection.findAll({ where: { slug: manifest.defaultCollections || [] } });
    for (const collection of collections) {
      const position = await CollectionTemplate.count({ where: { collectionId: collection.id } });
      await CollectionTemplate.create({ collectionId: collection.id, templateListingId: listing.id, sortOrder: position });
    }
  }
}

module.exports = {
  syncTemplateListings,
  listTemplates,
  updateTemplate,
  reorderTemplates,
  listCollections,
  createCollection,
  updateCollection,
  setCollectionTemplates,
  reorderCollections,
  setCollectionCover,
  seedDefaultCollections,
};
