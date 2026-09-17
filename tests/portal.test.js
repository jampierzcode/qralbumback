const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let token;
const admin = (method, url, opts = {}) => api.request(method, url, { token, ...opts });
const portal = (method, url, opts = {}) => api.request(method, `/api/portal/${url}`, opts);

async function imageForm(kind = "image") {
  const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#f0a" } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", new Blob([img], { type: "image/jpeg" }), "IMG_9999.JPG");
  return form;
}

async function giftWithRequest(body = {}) {
  const customer = await admin("POST", "/api/admin/customers", { body: { name: "Comprador Secreto", phone: "+51900111222", notes: "pagó 25 soles" } });
  const gift = await admin("POST", "/api/admin/gifts", {
    body: { templateId: "yellow-flowers", customerId: customer.body.id, recipientName: "Andrea", senderName: "Diego" },
  });
  const request = await admin("POST", `/api/admin/gifts/${gift.body.id}/content-requests`, { body });
  assert.equal(request.status, 201, request.text);
  return { gift: gift.body, request: request.body };
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

describe("solicitar contenido (admin)", () => {
  test("crea link firmado, pasa el regalo a 'esperando contenido' y deja un solo link activo", async () => {
    const { gift, request } = await giftWithRequest();
    // Sin puntos: WhatsApp reconoce el link completo.
    assert.match(request.token, /^[A-Za-z0-9_-]{22}~[A-Za-z0-9_-]{32}$/);
    assert.equal(request.status, "active");
    // cover tiene customerEditable:false en el fixture
    assert.deepEqual(request.allowedFields.sort(), ["message", "photos", "recipientName", "song"]);

    const detail = await admin("GET", `/api/admin/gifts/${gift.id}`);
    assert.equal(detail.body.status, "collecting_content");

    const second = await admin("POST", `/api/admin/gifts/${gift.id}/content-requests`, { body: { allowedFields: ["photos"] } });
    const list = await admin("GET", `/api/admin/gifts/${gift.id}/content-requests`);
    assert.equal(list.body.items.filter((r) => r.status === "active").length, 1);
    assert.equal(list.body.items.find((r) => r.id === request.id).status, "revoked");
    assert.deepEqual(second.body.allowedFields, ["photos"]);
    // el link revocado ya no funciona
    assert.equal((await portal("GET", request.token)).status, 410);
  });

  test("no se puede pedir contenido de un regalo publicado", async () => {
    const gift = await admin("POST", "/api/admin/gifts", { body: { templateId: "love-letter" } });
    await admin("POST", `/api/admin/gifts/${gift.body.id}/status`, { body: { status: "published" } });
    const res = await admin("POST", `/api/admin/gifts/${gift.body.id}/content-requests`);
    assert.equal(res.status, 409);
  });
});

describe("portal del comprador", () => {
  test("tokens manipulados o inventados no funcionan", async () => {
    const { request } = await giftWithRequest();
    const [id, sig] = request.token.split("~");
    for (const bad of [`${id}.${sig.slice(0, -1)}x`, `${id}`, "abc.def", `AAAAAAAAAAAAAAAAAAAAAA.${sig}`]) {
      const res = await portal("GET", encodeURIComponent(bad));
      assert.equal(res.status, 404, bad);
      assert.match(res.body.error, /no es válido/);
    }
  });

  test("la vista del portal no expone datos internos", async () => {
    const { request, gift } = await giftWithRequest();
    const res = await portal("GET", request.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.gift.recipientName, "Andrea");
    assert.equal(res.body.template.id, "yellow-flowers");
    for (const secret of ["Comprador Secreto", "+51900111222", "25 soles", gift.id, gift.slug, "customerId", "admin@test.local"]) {
      assert.ok(!res.text.includes(secret), `el portal expone "${secret}"`);
    }
  });

  test("sólo puede modificar los campos permitidos y guarda en borrador", async () => {
    const { request, gift } = await giftWithRequest({ allowedFields: ["message", "photos"] });
    const bad = await portal("PATCH", `${request.token}/content`, { body: { values: { message: "Hola amor", cover: null, recipientName: "Otra" } } });
    assert.equal(bad.status, 422);
    const paths = bad.body.details.errors.map((e) => e.path).sort();
    assert.deepEqual(paths, ["cover", "recipientName"]);

    const ok = await portal("PATCH", `${request.token}/content`, { body: { values: { message: "Hola amor" } } });
    assert.equal(ok.status, 200);
    const detail = await admin("GET", `/api/admin/gifts/${gift.id}`);
    assert.equal(detail.body.content.message, "Hola amor");
    assert.equal(detail.body.recipientName, "Andrea");
  });

  test("sube fotos como comprador, sin exponer el nombre de archivo en la respuesta de uploadedBy", async () => {
    const { request, gift } = await giftWithRequest();
    const upload = await portal("POST", `${request.token}/media`, { form: await imageForm() });
    assert.equal(upload.status, 201, upload.text);
    assert.ok(!("uploadedBy" in upload.body));

    const detail = await admin("GET", `/api/admin/gifts/${gift.id}`);
    assert.equal(detail.body.media.find((m) => m.id === upload.body.id).uploadedBy, "customer");
  });

  test("no puede borrar archivos del admin; sólo los desvincula de su campo", async () => {
    const { request, gift } = await giftWithRequest();
    const adminUpload = await admin("POST", `/api/admin/gifts/${gift.id}/media`, { form: await imageForm() });
    await admin("PATCH", `/api/admin/gifts/${gift.id}`, { body: { content: { photos: [{ assetId: adminUpload.body.id }] } } });

    const res = await portal("DELETE", `${request.token}/media/${adminUpload.body.id}`);
    assert.equal(res.status, 204);
    const detail = await admin("GET", `/api/admin/gifts/${gift.id}`);
    assert.ok(detail.body.media.some((m) => m.id === adminUpload.body.id), "el archivo del admin no debe borrarse");
    assert.deepEqual(detail.body.content.photos, []);
  });

  test("enviar incompleto responde qué falta; completo pasa el regalo a 'listo' y cierra el link", async () => {
    const { request, gift } = await giftWithRequest();
    const incomplete = await portal("POST", `${request.token}/submit`);
    assert.equal(incomplete.status, 422);
    assert.match(incomplete.body.error, /Faltan algunos datos/);

    const photo = await portal("POST", `${request.token}/media`, { form: await imageForm() });
    await portal("PATCH", `${request.token}/content`, { body: { values: { message: "Te quiero muchísimo", photos: [{ assetId: photo.body.id }] } } });
    const ok = await portal("POST", `${request.token}/submit`);
    assert.equal(ok.status, 200, ok.text);

    const detail = await admin("GET", `/api/admin/gifts/${gift.id}`);
    assert.equal(detail.body.status, "ready");
    const list = await admin("GET", `/api/admin/gifts/${gift.id}/content-requests`);
    assert.equal(list.body.items[0].status, "submitted");
    assert.ok(list.body.items[0].submittedAt);
    assert.ok(list.body.items[0].lastUsedAt);

    // Puede ver la pantalla de "listo", pero ya no editar
    const view = await portal("GET", request.token);
    assert.equal(view.body.status, "submitted");
    const edit = await portal("PATCH", `${request.token}/content`, { body: { values: { message: "cambio tardío" } } });
    assert.equal(edit.status, 410);
  });

  test("links vencidos o revocados muestran mensajes claros", async () => {
    const { request } = await giftWithRequest();
    await sequelize.query("UPDATE ContentRequests SET expiresAt = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?", { replacements: [request.id] });
    const expired = await portal("GET", request.token);
    assert.equal(expired.status, 410);
    assert.match(expired.body.error, /venció/);

    const second = await giftWithRequest();
    await admin("POST", `/api/admin/content-requests/${second.request.id}/revoke`);
    const revoked = await portal("GET", second.request.token);
    assert.equal(revoked.status, 410);
    assert.match(revoked.body.error, /desactivado/);
  });

  test("si el admin publica el regalo, el portal se cierra", async () => {
    const { request, gift } = await giftWithRequest();
    const photo = await admin("POST", `/api/admin/gifts/${gift.id}/media`, { form: await imageForm() });
    await admin("PATCH", `/api/admin/gifts/${gift.id}`, { body: { content: { message: "Mensaje listo", photos: [{ assetId: photo.body.id }] } } });
    await admin("POST", `/api/admin/gifts/${gift.id}/status`, { body: { status: "published" } });
    const res = await portal("GET", request.token);
    assert.equal(res.status, 410);
  });
});
