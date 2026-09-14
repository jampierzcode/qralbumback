// Crea o actualiza una cuenta de administrador.
// Uso: npm run admin:create -- --email=tu@correo.com --password=secreto --name="Tu nombre" [--role=superadmin]
const bcrypt = require("bcryptjs");
const sequelize = require("../config/db");
const { User } = require("../models");

function arg(name) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
}

async function main() {
  const email = arg("email");
  const password = arg("password");
  const name = arg("name") || "Administrador";
  const role = arg("role") || "superadmin";

  if (!email || !password) throw new Error("Debes indicar --email y --password.");
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  if (!["superadmin", "admin"].includes(role)) throw new Error("Rol inválido.");

  const hash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    await existing.update({ password: hash, name, role });
    console.log(`Actualizado: ${email} (${role})`);
  } else {
    await User.create({ email, password: hash, name, role });
    console.log(`Creado: ${email} (${role})`);
  }
}

main()
  .catch((err) => {
    console.error("❌", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
