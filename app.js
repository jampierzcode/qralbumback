const config = require("./config/config");
const sequelize = require("./config/db");
const { buildMigrator } = require("./db/migrator");
const { createApp } = require("./server");
const { seedDefaultCollections, syncTemplateListings } = require("./services/catalog");

async function start() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error("❌ No se pudo conectar a MySQL:", err.message);
    process.exit(1);
  }

  // Las migraciones reemplazan a sequelize.sync().
  const pending = await buildMigrator({ logger: undefined }).pending();
  if (pending.length) {
    console.error(
      `❌ Hay ${pending.length} migración(es) pendiente(s): ${pending.map((m) => m.name).join(", ")}\n` +
        "   Ejecuta: npm run db:migrate"
    );
    process.exit(1);
  }

  // Registra en el catálogo las plantillas nuevas encontradas en el repositorio.
  // Las colecciones sugeridas se crean antes (idempotente por slug) para que una
  // plantilla nueva caiga en su colección sin tener que correr el seed a mano.
  try {
    await seedDefaultCollections();
    const created = await syncTemplateListings();
    if (created.length) console.log(`🧩 Plantillas nuevas en el catálogo: ${created.join(", ")}`);
  } catch (err) {
    console.error("❌ No se pudieron cargar las plantillas:", err.message);
    process.exit(1);
  }

  createApp().listen(config.port, () =>
    console.log(`🚀 Server running on http://localhost:${config.port}`)
  );
}

start();
