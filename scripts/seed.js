// Datos iniciales idempotentes: colecciones comerciales y catálogo de plantillas.
// Uso: npm run db:seed
const sequelize = require("../config/db");
const catalog = require("../services/catalog");

async function main() {
  await catalog.seedDefaultCollections();
  const created = await catalog.syncTemplateListings();
  await catalog.seedDefaultCollections(); // asigna plantillas recién sincronizadas
  const collections = await catalog.listCollections();
  console.log(`Colecciones: ${collections.map((c) => `${c.name} (${c.templateIds.length})`).join(", ")}`);
  if (created.length) console.log(`Plantillas agregadas: ${created.join(", ")}`);
}

main()
  .catch((err) => {
    console.error("❌", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
