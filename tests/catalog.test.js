const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");
const catalog = require("../services/catalog");

let api;
let token;
const req = (method, url, opts = {}) => api.request(method, url, { token, ...opts });

before(async () => {
  await resetDatabase();
  await catalog.seedDefaultCollections(); // colecciones antes de que se sincronicen plantillas
  api = await startServer();
  token = await loginAs(api.request, await createAdmin());
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("las plantillas del repositorio aparecen solas en el catálogo (ignora carpetas _privadas)", async () => {
  const res = await req("GET", "/api/admin/templates");
  assert.equal(res.status, 200);
  const ids = res.body.items.map((t) => t.templateId).sort();
  assert.deepEqual(ids, ["love-letter", "yellow-flowers"]);
  const flowers = res.body.items.find((t) => t.templateId === "yellow-flowers");
  assert.equal(flowers.name, "Flores amarillas");
  assert.equal(flowers.available, true);
  assert.deepEqual(flowers.collections.map((c) => c.slug).sort(), ["amor", "flores"]);
});

test("sincronizar de nuevo no duplica ni pisa ediciones del admin", async () => {
  await req("PATCH", "/api/admin/templates/yellow-flowers", { body: { name: "Girasoles para ti", isActive: false } });
  const created = await catalog.syncTemplateListings();
  assert.deepEqual(created, []);
  const res = await req("GET", "/api/admin/templates");
  const flowers = res.body.items.find((t) => t.templateId === "yellow-flowers");
  assert.equal(flowers.name, "Girasoles para ti");
  assert.equal(flowers.isActive, false);
});

test("una plantilla puede estar en varias colecciones y las colecciones iniciales existen", async () => {
  const res = await req("GET", "/api/admin/collections");
  const bySlug = Object.fromEntries(res.body.items.map((c) => [c.slug, c]));
  assert.deepEqual(Object.keys(bySlug).sort(), ["amistad", "amor", "aniversario", "cumpleanos", "flores"]);
  assert.ok(bySlug.amor.templateIds.includes("yellow-flowers"));
  assert.ok(bySlug.amor.templateIds.includes("love-letter"));
  assert.ok(bySlug.flores.templateIds.includes("yellow-flowers"));
});

test("crear, editar, activar/desactivar y ordenar colecciones", async () => {
  const created = await req("POST", "/api/admin/collections", {
    body: { name: "Día de la Madre", description: "Para mamá" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.slug, "dia-de-la-madre");
  assert.equal(created.body.isActive, true);

  const dup = await req("POST", "/api/admin/collections", { body: { name: "Día de la madre" } });
  assert.equal(dup.body.slug, "dia-de-la-madre-2");

  const edited = await req("PATCH", `/api/admin/collections/${created.body.id}`, {
    body: { name: "Mamá", description: "Detalles para mamá", isActive: false },
  });
  assert.equal(edited.body.name, "Mamá");
  assert.equal(edited.body.isActive, false);

  const bad = await req("PATCH", `/api/admin/collections/${created.body.id}`, { body: { name: "  " } });
  assert.equal(bad.status, 400);

  const list = await req("GET", "/api/admin/collections");
  const reversed = list.body.items.map((c) => c.id).reverse();
  const ordered = await req("PUT", "/api/admin/collections/order", { body: { ids: reversed } });
  assert.deepEqual(ordered.body.items.map((c) => c.id), reversed);
});

test("asignar y ordenar plantillas dentro de una colección", async () => {
  const list = await req("GET", "/api/admin/collections");
  const cumple = list.body.items.find((c) => c.slug === "cumpleanos");

  const assigned = await req("PUT", `/api/admin/collections/${cumple.id}/templates`, {
    body: { templateIds: ["love-letter", "yellow-flowers"] },
  });
  assert.deepEqual(assigned.body.templateIds, ["love-letter", "yellow-flowers"]);

  const reordered = await req("PUT", `/api/admin/collections/${cumple.id}/templates`, {
    body: { templateIds: ["yellow-flowers", "love-letter"] },
  });
  assert.deepEqual(reordered.body.templateIds, ["yellow-flowers", "love-letter"]);

  const unknown = await req("PUT", `/api/admin/collections/${cumple.id}/templates`, {
    body: { templateIds: ["no-existe"] },
  });
  assert.equal(unknown.status, 400);
});

test("portada de colección se procesa a WebP", async () => {
  const list = await req("GET", "/api/admin/collections");
  const amor = list.body.items.find((c) => c.slug === "amor");
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#c2185b" } }).png().toBuffer();
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "portada.png");
  const res = await req("POST", `/api/admin/collections/${amor.id}/cover`, { form });
  assert.equal(res.status, 200, res.text);
  const image = await fetch(api.base + res.body.coverUrl);
  assert.equal(image.headers.get("content-type"), "image/webp");
});

test("crear regalo con una plantilla inexistente falla y usa la versión del manifest", async () => {
  const bad = await req("POST", "/api/admin/gifts", { body: { templateId: "no-existe" } });
  assert.equal(bad.status, 400);
  const ok = await req("POST", "/api/admin/gifts", { body: { templateId: "love-letter" } });
  assert.equal(ok.body.templateVersion, 2);
});
