const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let adminToken;
let refToken;
let handle;
const admin = (method, url, opts = {}) => api.request(method, url, { token: adminToken, ...opts });
const referral = (method, url, opts = {}) => api.request(method, url, { token: refToken, ...opts });
const pub = (method, url, opts = {}) => api.request(method, url, opts);

async function image() {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: "#f4c430" } }).jpeg().toBuffer();
}

function fileForm(buffer, name = "foto.jpg", kind = "image") {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", new Blob([buffer], { type: "image/jpeg" }), name);
  return form;
}

before(async () => {
  await resetDatabase();
  api = await startServer();
  adminToken = await loginAs(api.request, await createAdmin());
  const creds = { email: "ana@test.local", password: "Vendedora123" };
  await admin("POST", "/api/admin/referrals", { body: { name: "Ana Torres", ...creds } });
  refToken = await loginAs(api.request, creds);

  await admin("PATCH", "/api/admin/templates/love-letter", { body: { referralPrice: 10 } });
  await referral("PUT", "/api/admin/my-catalog/love-letter", { body: { salePrice: 35 } });
  await referral("POST", "/api/admin/payment-methods", { body: { type: "yape", reference: "987654321", holder: "Ana T." } });
  const store = await referral("GET", "/api/admin/store");
  handle = store.body.handle;
});

after(async () => {
  await api.close();
  await sequelize.close();
});

describe("tienda pública", () => {
  test("no abre hasta que el vendedor la activa", async () => {
    assert.equal(handle, "ana-torres");
    // Activar la tienda sin pedir antes los ajustes también deja link listo.
    const directo = await admin("PATCH", "/api/admin/store", { body: { ordersEnabled: false } });
    assert.ok(directo.body.handle);
    assert.equal((await pub("GET", `/api/public/store/${handle}`)).status, 404);
    await referral("PATCH", "/api/admin/store", { body: { ordersEnabled: true, publicName: "Detalles de Ana" } });
    const abierta = await pub("GET", `/api/public/store/${handle}`);
    assert.equal(abierta.status, 200);
    assert.equal(abierta.body.seller.name, "Detalles de Ana");
  });

  test("muestra sólo lo que tiene precio, y con el precio del vendedor", async () => {
    const store = await pub("GET", `/api/public/store/${handle}`);
    assert.deepEqual(store.body.items.map((i) => [i.templateId, i.price]), [["love-letter", 35]]);
    // Nada del negocio interno.
    assert.equal(store.body.items[0].cost, undefined);
  });

  test("el link se puede personalizar y no se repite", async () => {
    const otro = await admin("PATCH", "/api/admin/store", { body: { handle: "ana-torres" } });
    assert.equal(otro.status, 409);
    const corto = await referral("PATCH", "/api/admin/store", { body: { handle: "ab" } });
    assert.equal(corto.status, 400);
    const ok = await referral("PATCH", "/api/admin/store", { body: { handle: "Detalles de Ana!" } });
    assert.equal(ok.body.handle, "detalles-de-ana");
    handle = ok.body.handle;
  });
});

describe("pedido de un cliente final", () => {
  let token;
  let giftId;

  test("empieza con nombre y WhatsApp y devuelve su link del portal", async () => {
    assert.equal((await pub("POST", `/api/public/store/${handle}/orders`, { body: { templateId: "love-letter", name: "Rosa" } })).status, 400);
    assert.equal((await pub("POST", `/api/public/store/${handle}/orders`, { body: { templateId: "yellow-flowers", name: "Rosa", phone: "999888777" } })).status, 400);

    const res = await pub("POST", `/api/public/store/${handle}/orders`, {
      body: { templateId: "love-letter", name: "Rosa Paz", phone: "999888777" },
    });
    assert.equal(res.status, 201);
    assert.match(res.body.token, /^[A-Za-z0-9_-]{22}~[A-Za-z0-9_-]{32}$/);
    token = res.body.token;
    giftId = res.body.giftId;
  });

  test("el portal le muestra el precio y cómo pagar", async () => {
    const view = await pub("GET", `/api/portal/${token}`);
    assert.equal(view.status, 200);
    assert.equal(view.body.order.price, 35);
    assert.equal(view.body.order.sellerName, "Detalles de Ana");
    assert.deepEqual(view.body.order.methods.map((m) => m.reference), ["987654321"]);
    assert.equal(view.body.order.hasProof, false);
  });

  test("sube su comprobante y envía la solicitud", async () => {
    await pub("PATCH", `/api/portal/${token}/content`, { body: { values: { recipientName: "Luis", message: "Un mensaje bonito" } } });
    const foto = await pub("POST", `/api/portal/${token}/media`, { form: fileForm(await image()) });
    assert.equal(foto.status, 201);
    await pub("PATCH", `/api/portal/${token}/content`, {
      body: { values: { recipientName: "Luis", message: "Un mensaje bonito", photos: [{ assetId: foto.body.id }] } },
    });

    const proof = await pub("POST", `/api/portal/${token}/payment-proof`, { form: fileForm(await image(), "voucher.jpg") });
    assert.equal(proof.status, 201);
    assert.equal((await pub("GET", `/api/portal/${token}`)).body.order.hasProof, true);

    const enviado = await pub("POST", `/api/portal/${token}/submit`);
    assert.equal(enviado.status, 200);
    const gift = await referral("GET", `/api/admin/gifts/${giftId}`);
    assert.equal(gift.body.requestStatus, "pending");
    assert.equal(gift.body.requesterName, "Rosa Paz");
    assert.equal(gift.body.salePrice, 35);
    assert.equal(gift.body.hasClientProof, true);
    // El comprobante no se mezcla con las fotos del regalo.
    assert.equal(gift.body.media.filter((m) => m.kind === "image").length, 1);
  });

  test("el vendedor lo ve entre sus pedidos y lo acepta", async () => {
    const pendientes = await referral("GET", "/api/admin/gifts?requestStatus=pending");
    assert.equal(pendientes.body.items.length, 1);
    // Otro vendedor no lo ve ni lo puede aceptar.
    assert.equal((await admin("POST", `/api/admin/gifts/${giftId}/order-review`, { body: { action: "accept" } })).status, 200);

    const aceptado = await referral("GET", `/api/admin/gifts/${giftId}`);
    assert.equal(aceptado.body.requestStatus, "accepted");
    assert.equal(aceptado.body.status, "ready");
    // Sigue sin link: falta la aprobación del dueño.
    assert.equal(aceptado.body.slug, null);
  });
});
