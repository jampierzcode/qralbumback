// Registro de plantillas del lado servidor.
// El CÓDIGO de cada plantilla vive en el frontend (fuente de verdad):
//   qralbumfront/src/templates/<id>/manifest.js   (metadatos)
//   qralbumfront/src/templates/<id>/schema.js     (campos editables)
// El backend los importa desde la carpeta hermana para validar con el MISMO schema.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DEFAULT_ROOT = path.resolve(__dirname, "..", "..", "qralbumfront", "src", "templates");
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

let cache = null;

function templatesRoot() {
  return path.resolve(process.env.TEMPLATES_ROOT || DEFAULT_ROOT);
}

async function importDefault(file) {
  const mod = await import(pathToFileURL(file).href);
  return mod.default ?? mod;
}

async function load() {
  const root = templatesRoot();
  const templates = new Map();
  if (!fs.existsSync(root)) {
    console.warn(
      `⚠️  No se encontró la carpeta de plantillas en ${root}. El catálogo quedará vacío. ` +
        "Clona qralbumfront junto a qralbumback o define TEMPLATES_ROOT."
    );
    return templates;
  }

  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."));

  for (const dir of dirs) {
    const manifestFile = path.join(root, dir.name, "manifest.js");
    if (!fs.existsSync(manifestFile)) continue;

    const manifest = await importDefault(manifestFile);
    if (!manifest || manifest.id !== dir.name || !ID_PATTERN.test(manifest.id)) {
      throw new Error(`La plantilla "${dir.name}" debe exportar un manifest cuyo id sea "${dir.name}".`);
    }

    const schemaFile = path.join(root, dir.name, "schema.js");
    const schema = fs.existsSync(schemaFile) ? await importDefault(schemaFile) : null;

    templates.set(manifest.id, { manifest, schema });
  }
  return templates;
}

async function getTemplates() {
  if (!cache) {
    cache = load().catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}

async function getTemplate(templateId) {
  return (await getTemplates()).get(templateId) || null;
}

function resetCache() {
  cache = null;
}

// Datos del manifest que el admin necesita (sin assets: esos los resuelve el frontend).
function publicManifest(manifest) {
  return {
    id: manifest.id,
    version: manifest.version || 1,
    name: manifest.name,
    description: manifest.description || "",
    occasions: manifest.occasions || [],
    tier: manifest.tier || "css",
    supportsMusic: Boolean(manifest.supportsMusic),
  };
}

module.exports = { getTemplates, getTemplate, resetCache, templatesRoot, publicManifest };
