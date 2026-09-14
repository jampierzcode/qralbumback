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
    ["GET", "/api/clients"],
    ["POST", "/api/clients"],
    ["GET", "/api/clients/with/multimedia/all"],
    ["DELETE", "/api/clients/1"],
    ["POST", "/api/upload/abc"],
    ["DELETE", "/api/upload/1"],
  ]) {
    const res = await api.request(method, url);
    assert.equal(res.status, 401, `${method} ${url} debería exigir sesión`);
  }
});

test("un token con rol no administrativo recibe 403", async () => {
  const jwt = require("jsonwebtoken");
  const { jwtSecret } = require("../config/config");
  const clientToken = jwt.sign({ id: 999, role: "cliente" }, jwtSecret);
  const res = await api.request("GET", "/api/clients", { token: clientToken });
  assert.equal(res.status, 403);
});

test("crear cliente guarda la contraseña hasheada y no la devuelve", async () => {
  const res = await api.request("POST", "/api/clients", {
    token: adminToken,
    body: { name: "Ana", email: "ana@test.local", password: "textoPlano123" },
  });
  assert.equal(res.status, 201);
  assertNoPasswordDeep(res.body);

  const [row] = await sequelize.query("SELECT password FROM Users WHERE email = 'ana@test.local'", {
    type: QueryTypes.SELECT,
  });
  assert.notEqual(row.password, "textoPlano123");
  assert.match(row.password, /^\$2[aby]\$/);

  const list = await api.request("GET", "/api/clients", { token: adminToken });
  assertNoPasswordDeep(list.body);
  const withMedia = await api.request("GET", "/api/clients/with/multimedia/all", { token: adminToken });
  assertNoPasswordDeep(withMedia.body);
});

test("la ruta pública que exponía datos del cliente fue eliminada", async () => {
  const list = await api.request("GET", "/api/clients", { token: adminToken });
  const { uuid } = list.body[0];
  const res = await api.request("GET", `/api/clients/${uuid}`);
  assert.equal(res.status, 404);
  const files = await api.request("GET", `/api/clients/${uuid}/files?type=photo`);
  assert.equal(files.status, 200);
  assert.deepEqual(files.body, []);
});

test("subida rechaza tipos no permitidos y no deja temporales", async () => {
  const tmpDir = path.join(os.tmpdir(), "qralbum-uploads");
  const before = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).length : 0;

  const list = await api.request("GET", "/api/clients", { token: adminToken });
  const form = new FormData();
  form.append("type", "photo");
  form.append("files", new Blob(["#!/bin/sh"], { type: "application/x-sh" }), "malo.sh");
  const res = await api.request("POST", `/api/upload/${list.body[0].uuid}`, { token: adminToken, form });
  assert.equal(res.status, 415);

  const form2 = new FormData();
  form2.append("type", "audio");
  form2.append("files", new Blob(["fake"], { type: "image/png" }), "foto.png");
  const res2 = await api.request("POST", `/api/upload/${list.body[0].uuid}`, { token: adminToken, form: form2 });
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
