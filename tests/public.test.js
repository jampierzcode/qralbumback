const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { QueryTypes } = require("sequelize");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let token;
let gift;
const admin = (method, url, opts = {}) => api.request(method, url, { token, ...opts });

async function uploadImage(giftId, name) {
  const buffer = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#ffcc00" } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("kind", "image");
  form.append("file", new Blob([buffer], { type: "image/jpeg" }), name);
  const res = await admin("POST", `/api/admin/gifts/${giftId}/media`, { form });
  assert.equal(res.status, 201, res.text);
  return res.body;
}

before(async () => {
  await resetDatabase();
  api = await startServer();
  token = await loginAs(api.request, await createAdmin());
  const customer = await admin("POST", "/api/admin/customers", { body: { name: "Cliente Privado", phone: "+51999888777", email: "privado@example.com", notes: "pagó por Yape" } });
  const created = await admin("POST", "/api/admin/gifts", {
    body: { templateId: "yellow-flowers", customerId: customer.body.id, recipientName: "Andrea", senderName: "Diego" },
  });
  gift = created.body;
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("un regalo no publicado no es visible públicamente", async () => {
  const res = await api.request("GET", `/api/public/gifts/${gift.slug}`);
  assert.equal(res.status, 404);
  assert.match(res.body.error, /no existe o todavía no está listo/);
});

test("publicado: expone sólo datos de la experiencia y la media referenciada", async () => {
  const used = await uploadImage(gift.id, "IMG_4938.JPG");
  await uploadImage(gift.id, "foto-no-usada.jpg");
  await admin("PATCH", `/api/admin/gifts/${gift.id}`, {
    body: { content: { message: "Te quiero mucho", photos: [{ assetId: used.id }] } },
  });
  await admin("POST", `/api/admin/gifts/${gift.id}/status`, { body: { status: "published" } });

  const res = await api.request("GET", `/api/public/gifts/${gift.slug}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.gift.recipientName, "Andrea");
  assert.equal(res.body.gift.templateId, "yellow-flowers");
  assert.deepEqual(Object.keys(res.body.media), [used.id]);

  const text = res.text;
  for (const secret of ["Cliente Privado", "+51999888777", "privado@example.com", "Yape", "IMG_4938", "foto-no-usada", gift.id, "customerId", "status"]) {
    assert.ok(!text.includes(secret), `la respuesta pública expone "${secret}"`);
  }
});

test("eventos: registra aperturas válidas y rechaza tipos desconocidos", async () => {
  const ok = await api.request("POST", `/api/public/gifts/${gift.slug}/events`, { body: { type: "opened" } });
  assert.equal(ok.status, 204);
  const bad = await api.request("POST", `/api/public/gifts/${gift.slug}/events`, { body: { type: "hack" } });
  assert.equal(bad.status, 400);
  const detail = await admin("GET", `/api/admin/gifts/${gift.id}`);
  assert.equal(detail.body.stats.opens, 1);
});

test("links legados resuelven al slug nuevo", async () => {
  await sequelize.query("UPDATE Gifts SET legacyUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' WHERE id = ?", { replacements: [gift.id] });
  const res = await api.request("GET", "/api/public/legacy/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(res.status, 200);
  assert.equal(res.body.slug, gift.slug);
  const missing = await api.request("GET", "/api/public/legacy/no-existe");
  assert.equal(missing.status, 404);
});

test("archivar retira el regalo del acceso público", async () => {
  await admin("POST", `/api/admin/gifts/${gift.id}/status`, { body: { status: "archived" } });
  const res = await api.request("GET", `/api/public/gifts/${gift.slug}`);
  assert.equal(res.status, 404);
  const [{ n }] = await sequelize.query("SELECT COUNT(*) n FROM GiftEvents", { type: QueryTypes.SELECT });
  assert.equal(Number(n), 1);
});
