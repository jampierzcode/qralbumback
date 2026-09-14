const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { QueryTypes } = require("sequelize");
const {
  sequelize,
  resetDatabase,
  startServer,
  createAdmin,
  loginAs,
  assertNoPasswordDeep,
} = require("./helpers");

let api;
let adminToken;

before(async () => {
  await resetDatabase();
  api = await startServer();
  const creds = await createAdmin();
  adminToken = await loginAs(api.request, creds);
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("el registro público ya no existe", async () => {
  const res = await api.request("POST", "/api/auth/register", {
    body: { name: "x", email: "hacker@x.com", password: "12345678", role: "superadmin" },
  });
  assert.equal(res.status, 404);
  const [row] = await sequelize.query("SELECT COUNT(*) AS n FROM Users WHERE email = 'hacker@x.com'", {
    type: QueryTypes.SELECT,
  });
  assert.equal(Number(row.n), 0);
});

test("login rechaza credenciales inválidas con mensaje claro", async () => {
  const res = await api.request("POST", "/api/auth/login", {
    body: { email: "admin@test.local", password: "incorrecta" },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /incorrectos/);
});

test("GET /api/auth/me devuelve el admin sin contraseña", async () => {
  const res = await api.request("GET", "/api/auth/me", { token: adminToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, "admin@test.local");
  assertNoPasswordDeep(res.body);
});

test("endpoints admin exigen token", async () => {
  for (const [method, url] of [
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/customers"],
    ["POST", "/api/admin/customers"],
    ["GET", "/api/admin/gifts"],
    ["POST", "/api/admin/gifts"],
    ["PATCH", "/api/admin/gifts/abc"],
    ["POST", "/api/admin/gifts/abc/media"],
    ["DELETE", "/api/admin/gifts/abc/media/def"],
    ["GET", "/api/admin/templates"],
    ["GET", "/api/admin/collections"],
  ]) {
    const res = await api.request(method, url);
    assert.equal(res.status, 401, `${method} ${url} debería exigir sesión`);
  }
});

test("un token con rol no administrativo recibe 403", async () => {
  const jwt = require("jsonwebtoken");
  const { jwtSecret } = require("../config/config");
  const clientToken = jwt.sign({ id: 999, role: "cliente" }, jwtSecret);
  const res = await api.request("GET", "/api/admin/gifts", { token: clientToken });
  assert.equal(res.status, 403);
});

test("los endpoints del modelo anterior fueron retirados", async () => {
  for (const url of ["/api/clients", "/api/clients/x/files", "/api/upload/x"]) {
    const res = await api.request("GET", url, { token: adminToken });
    assert.equal(res.status, 404, url);
  }
});

test("subida rechaza tipos no permitidos y no deja temporales", async () => {
  const tmpDir = path.join(os.tmpdir(), "qralbum-uploads");
  const before = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).length : 0;

  const gift = await api.request("POST", "/api/admin/gifts", { token: adminToken, body: { templateId: "love-letter" } });
  const form = new FormData();
  form.append("file", new Blob(["#!/bin/sh"], { type: "application/x-sh" }), "malo.sh");
  const res = await api.request("POST", `/api/admin/gifts/${gift.body.id}/media`, { token: adminToken, form });
  assert.equal(res.status, 415);

  const form2 = new FormData();
  form2.append("kind", "image");
  form2.append("file", new Blob(["no es imagen"], { type: "image/png" }), "foto.png");
  const res2 = await api.request("POST", `/api/admin/gifts/${gift.body.id}/media`, { token: adminToken, form: form2 });
  assert.equal(res2.status, 415);

  const afterCount = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).length : 0;
  assert.equal(afterCount, before, "quedaron archivos temporales");
});

test("/uploads ya no se sirve estáticamente", async () => {
  const res = await api.request("GET", "/uploads/4f27d2a5a3d9d46d01c212e604a7e6b0");
  assert.notEqual(res.status, 200);
});

test("errores de JSON inválido responden 400 sin detalles internos", async () => {
  const res = await api.request("POST", "/api/auth/login", {
    headers: { "Content-Type": "application/json" },
    form: "{no-es-json",
  });
  assert.equal(res.status, 400);
  assert.ok(!/SyntaxError|at /.test(res.text));
});

test("la migración de seguridad hashea contraseñas legadas en texto plano", async () => {
  const migration = require("../migrations/20260914000002-admin-role-and-hash-legacy-passwords");
  await sequelize.query(
    "INSERT INTO Users (name, email, password, role, uuid, createdAt, updatedAt) VALUES ('Legado', 'legado@test.local', 'plano123', 'cliente', 'legacy-uuid-1', NOW(), NOW())"
  );
  // La migración es idempotente: se vuelve a ejecutar sobre el dato legado.
  await migration.up({ context: { queryInterface: sequelize.getQueryInterface(), sequelize } });
  const [row] = await sequelize.query("SELECT password FROM Users WHERE email = 'legado@test.local'", {
    type: QueryTypes.SELECT,
  });
  assert.match(row.password, /^\$2[aby]\$/);
});
