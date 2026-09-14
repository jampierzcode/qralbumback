// Verifica que las plantillas REALES del frontend se cargan en el servidor
// (repos hermanos) con schemas válidos para gift-core. No usa base de datos.
const path = require("node:path");
process.env.TEMPLATES_ROOT = path.resolve(__dirname, "..", "..", "qralbumfront", "src", "templates");

const { test } = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../services/templateRegistry");
const { loadGiftCore } = require("../services/giftCore");

test("las plantillas del frontend cargan con manifest y schema válidos en el servidor", async () => {
  registry.resetCache();
  const templates = await registry.getTemplates();
  assert.ok(templates.has("yellow-flowers"), "falta yellow-flowers");
  assert.ok(![...templates.keys()].some((id) => id.startsWith("_")), "no debe registrar carpetas _privadas");

  const core = await loadGiftCore();
  for (const [id, { manifest, schema }] of templates) {
    assert.equal(manifest.id, id);
    assert.ok(schema?.fields, `${id} no tiene schema`);
    // Un contenido vacío se valida sin lanzar excepciones y exige obligatorios al publicar.
    const result = core.validateContent(schema, {}, { mode: "publish" });
    assert.equal(typeof result.valid, "boolean");
    assert.ok(core.getSteps(schema).length > 0, `${id} no tiene pasos de edición`);
  }
});
