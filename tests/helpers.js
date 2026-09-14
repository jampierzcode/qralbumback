// Utilidades de pruebas de integración contra una base MySQL de pruebas.
const os = require("node:os");
const path = require("node:path");
// Media de pruebas en un directorio temporal (antes de cargar storage).
process.env.STORAGE_DIR ||= path.join(os.tmpdir(), `qralbum-test-storage-${process.pid}`);
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const sequelize = require("../config/db");
const { buildMigrator } = require("../db/migrator");
const { createApp } = require("../server");

if (process.env.NODE_ENV !== "test" || !/test/.test(sequelize.config.database)) {
  throw new Error("Las pruebas sólo pueden correr con NODE_ENV=test y una base *_test.");
}

async function resetDatabase() {
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
  const tables = await sequelize.getQueryInterface().showAllTables();
  for (const t of tables) {
    const name = typeof t === "string" ? t : t.tableName;
    await sequelize.query(`DROP TABLE IF EXISTS \`${name}\``);
  }
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
  await buildMigrator({ logger: undefined }).up();
}

async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { token, body, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (form) init.body = form;
    else if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, body: json, text, headers: res.headers };
  }

  return { base, request, close: () => new Promise((r) => server.close(r)) };
}

async function createAdmin({ email = "admin@test.local", password = "Admin123!", role = "superadmin" } = {}) {
  const { User } = require("../models");
  await User.create({ name: "Admin", email, role, password: await bcrypt.hash(password, 10) });
  return { email, password };
}

async function loginAs(request, creds) {
  const res = await request("POST", "/api/auth/login", { body: creds });
  assert.equal(res.status, 200, `login falló: ${res.text}`);
  return res.body.token;
}

function assertNoPasswordDeep(value, path = "body") {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPasswordDeep(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      assert.notEqual(k, "password", `se expuso "password" en ${path}`);
      assertNoPasswordDeep(v, `${path}.${k}`);
    }
  }
}

module.exports = { sequelize, resetDatabase, startServer, createAdmin, loginAs, assertNoPasswordDeep };
