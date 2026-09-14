const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");
const catalog = require("../services/catalog");

let api;
let token;
const admin = (method, url, opts = {}) => api.request(method, url, { token, ...opts });

before(async () => {
  await resetDatabase();
  await catalog.seedDefaultCollections();
  api = await startServer();
  token = await loginAs(api.request, await createAdmin());
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("dashboard: conteos por estado, aperturas, recientes y plantillas más usadas", async () => {
  const ids = [];
  for (const templateId of ["love-letter", "love-letter", "yellow-flowers"]) {
    ids.push((await admin("POST", "/api/admin/gifts", { body: { templateId } })).body.id);
  }
  await admin("POST", `/api/admin/gifts/${ids[0]}/status`, { body: { status: "collecting_content" } });
  await admin("POST", `/api/admin/gifts/${ids[1]}/status`, { body: { status: "archived" } });

  const res = await admin("GET", "/api/admin/dashboard");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.stats, { total: 2, draft: 1, collectingContent: 1, ready: 0, published: 0, archived: 1, opens: 0 });
  assert.equal(res.body.recentGifts.length, 2);
  assert.equal(res.body.topTemplates.length, 2);
});

test("filtrar regalos por colección", async () => {
  const collections = await admin("GET", "/api/admin/collections");
  const flores = collections.body.items.find((c) => c.slug === "flores"); // sólo yellow-flowers
  const res = await admin("GET", `/api/admin/gifts?collectionId=${flores.id}`);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((g) => g.templateId === "yellow-flowers"));

  const cumple = collections.body.items.find((c) => c.slug === "cumpleanos"); // vacía
  const empty = await admin("GET", `/api/admin/gifts?collectionId=${cumple.id}`);
  assert.equal(empty.body.items.length, 0);
});
