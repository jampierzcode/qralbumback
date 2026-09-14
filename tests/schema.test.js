const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { QueryTypes } = require("sequelize");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let token;
const admin = (method, url, opts = {}) => api.request(method, url, { token, ...opts });

async function newGift(body = {}) {
  const res = await admin("POST", "/api/admin/gifts", { body: { templateId: "yellow-flowers", ...body } });
  assert.equal(res.status, 201, res.text);
  return res.body;
}

async function upload(giftId, kind = "image") {
  const form = new FormData();
  form.append("kind", kind);
  if (kind === "image") {
    const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
    form.append("file", new Blob([img], { type: "image/png" }), "a.png");
  } else {
    form.append("file", new Blob([Buffer.concat([Buffer.from("ID3"), Buffer.alloc(512)])], { type: "audio/mpeg" }), "a.mp3");
  }
  const res = await admin("POST", `/api/admin/gifts/${giftId}/media`, { form });
  assert.equal(res.status, 201, res.text);
  return res.body;
}

before(async () => {
  await resetDatabase();
  api = await startServer();
  token = await loginAs(api.request, await createAdmin());
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("guardar valida con el schema de la plantilla (modo borrador) y devuelve errores por campo", async () => {
  const gift = await newGift();
  const res = await admin("PATCH", `/api/admin/gifts/${gift.id}`, {
    body: { content: { message: "x".repeat(201), photos: "no-es-lista" } },
  });
  assert.equal(res.status, 422);
  const paths = res.body.details.errors.map((e) => e.path).sort();
  assert.deepEqual(paths, ["message", "photos"]);

  // Borrador incompleto sí se guarda
  const ok = await admin("PATCH", `/api/admin/gifts/${gift.id}`, { body: { content: { message: "hola" } } });
  assert.equal(ok.status, 200);
});

test("los campos enlazados van a columnas y las claves desconocidas se descartan", async () => {
  const gift = await newGift();
  const res = await admin("PATCH", `/api/admin/gifts/${gift.id}`, {
    body: { content: { recipientName: "Lucía", message: "Te quiero mucho", inventado: "<script>" } },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.recipientName, "Lucía");
  assert.ok(!("recipientName" in res.body.content));
  assert.ok(!("inventado" in res.body.content));
});

test("guardar parcial fusiona y conserva claves de versiones anteriores de la plantilla", async () => {
  const gift = await newGift();
  await sequelize.query("UPDATE Gifts SET content = ? WHERE id = ?", {
    replacements: [JSON.stringify({ videos: [{ assetId: "legado" }], message: "Mensaje anterior" }), gift.id],
  });
  const res = await admin("PATCH", `/api/admin/gifts/${gift.id}`, { body: { content: { recipientName: "Ana" } } });
  assert.equal(res.status, 200);
  assert.equal(res.body.content.message, "Mensaje anterior");
  assert.deepEqual(res.body.content.videos, [{ assetId: "legado" }]);
});

test("referencias a media deben pertenecer al mismo regalo y ser del tipo correcto", async () => {
  const a = await newGift();
  const b = await newGift();
  const foreign = await upload(b.id);
  const audio = await upload(a.id, "audio");

  const res = await admin("PATCH", `/api/admin/gifts/${a.id}`, {
    body: { content: { photos: [{ assetId: foreign.id }], song: { assetId: audio.id }, cover: { assetId: audio.id } } },
  });
  assert.equal(res.status, 422);
  const messages = res.body.details.errors.map((e) => e.message).join(" | ");
  assert.match(messages, /ya no existe/);
  assert.match(messages, /tipo de archivo incorrecto/);
});

test("publicar exige contenido completo con mensajes claros", async () => {
  const gift = await newGift();
  const blocked = await admin("POST", `/api/admin/gifts/${gift.id}/status`, { body: { status: "published" } });
  assert.equal(blocked.status, 422);
  assert.match(blocked.body.error, /Faltan datos/);
  const paths = blocked.body.details.errors.map((e) => e.path).sort();
  assert.deepEqual(paths, ["message", "photos", "recipientName"]);

  const photo = await upload(gift.id);
  await admin("PATCH", `/api/admin/gifts/${gift.id}`, {
    body: { recipientName: "Ana", content: { message: "Feliz día", photos: [{ assetId: photo.id }] } },
  });
  const ok = await admin("POST", `/api/admin/gifts/${gift.id}/status`, { body: { status: "published" } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.status, "published");
});

test("borrar un archivo quita sus referencias del contenido", async () => {
  const gift = await newGift();
  const p1 = await upload(gift.id);
  const p2 = await upload(gift.id);
  const song = await upload(gift.id, "audio");
  await admin("PATCH", `/api/admin/gifts/${gift.id}`, {
    body: { content: { photos: [{ assetId: p1.id }, { assetId: p2.id }], song: { assetId: song.id } } },
  });

  await admin("DELETE", `/api/admin/gifts/${gift.id}/media/${p1.id}`);
  await admin("DELETE", `/api/admin/gifts/${gift.id}/media/${song.id}`);
  const [row] = await sequelize.query("SELECT content FROM Gifts WHERE id = ?", { replacements: [gift.id], type: QueryTypes.SELECT });
  const content = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
  assert.deepEqual(content.photos, [{ assetId: p2.id }]);
  assert.equal(content.song, null);
});
