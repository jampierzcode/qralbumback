const config = require("./config/config");
const sequelize = require("./config/db");
const { buildMigrator } = require("./db/migrator");
const { createApp } = require("./server");

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

  createApp().listen(config.port, () =>
    console.log(`🚀 Server running on http://localhost:${config.port}`)
  );
}

start();
