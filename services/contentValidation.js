// Validación del contenido de un regalo con el MISMO schema que usa el frontend.
const { MediaAsset } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const registry = require("./templateRegistry");
const { loadGiftCore } = require("./giftCore");

async function schemaFor(gift) {
  const template = await registry.getTemplate(gift.templateId);
  if (!template?.schema) {
    throw new HttpError(409, "La plantilla de este regalo ya no está disponible. No se puede editar su contenido.");
  }
  return template.schema;
}

async function assetKinds(giftId) {
  const assets = await MediaAsset.findAll({ where: { giftId, status: "ready" }, attributes: ["id", "kind"] });
  return Object.fromEntries(assets.map((a) => [a.id, { kind: a.kind }]));
}

function invalid(message, errors) {
  return new HttpError(422, message, { errors });
}

/**
 * Valida valores parciales (modo borrador) y devuelve el contenido fusionado
 * y los nombres enlazados a columnas.
 * @param {object} gift       instancia Sequelize
 * @param {object} values     valores enviados (pueden incluir recipientName / senderName)
 * @param {{ keys?: string[] }} [options] claves permitidas (portal del comprador)
 */
async function applyContentUpdate(gift, values, { keys } = {}) {
  const core = await loadGiftCore();
  const schema = await schemaFor(gift);
  const result = core.validateContent(schema, values, { mode: "draft", keys, assets: await assetKinds(gift.id) });
  if (!result.valid) throw invalid("Revisa los datos marcados.", result.errors);

  const { content, bound } = core.splitBoundValues(result.value);
  // Fusión: sólo se reemplazan las claves enviadas. Las claves que ya no existen
  // en el schema (versiones anteriores de la plantilla) se conservan.
  return { content: { ...(gift.content || {}), ...content }, bound };
}

/** Exige contenido completo (obligatorios y mínimos) para publicar o enviar. */
async function assertComplete(gift, { keys, message = "Faltan datos para publicar el regalo." } = {}) {
  const core = await loadGiftCore();
  const schema = await schemaFor(gift);
  const values = core.mergeBoundValues(gift.content || {}, gift);
  const scoped = keys ? Object.fromEntries(Object.entries(values).filter(([k]) => keys.includes(k))) : values;
  const result = core.validateContent(schema, scoped, { mode: "publish", keys, assets: await assetKinds(gift.id) });
  if (!result.valid) throw invalid(message, result.errors);
}

// Quita todas las referencias { assetId } a un archivo borrado.
function stripAssetRefs(value, assetId) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === "object" && item.assetId === assetId && Object.keys(item).length <= 2))
      .map((item) => stripAssetRefs(item, assetId));
  }
  if (value && typeof value === "object") {
    if (value.assetId === assetId) return null;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripAssetRefs(v, assetId)]));
  }
  return value;
}

module.exports = { applyContentUpdate, assertComplete, stripAssetRefs, schemaFor };
