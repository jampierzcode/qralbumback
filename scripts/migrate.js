// Uso: node scripts/migrate.js [up|down|status]
const { buildMigrator } = require("../db/migrator");
const sequelize = require("../config/db");

async function main() {
  const command = process.argv[2] || "up";
  const migrator = buildMigrator();

  if (command === "up") {
    const done = await migrator.up();
    console.log(done.length ? `Aplicadas: ${done.map((m) => m.name).join(", ")}` : "Base de datos al día.");
  } else if (command === "down") {
    const undone = await migrator.down();
    console.log(`Revertidas: ${undone.map((m) => m.name).join(", ") || "ninguna"}`);
  } else if (command === "status") {
    const executed = await migrator.executed();
    const pending = await migrator.pending();
    console.log("Ejecutadas:", executed.map((m) => m.name));
    console.log("Pendientes:", pending.map((m) => m.name));
  } else {
    throw new Error(`Comando desconocido: ${command}`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Error de migración:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
