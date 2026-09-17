const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let adminToken;
let refToken;
const admin = (method, url, opts = {}) => api.request(method, url, { token: adminToken, ...opts });
const referral = (method, url, opts = {}) => api.request(method, url, { token: refToken, ...opts });

before(async () => {
  await resetDatabase();
  api = await startServer();
  adminToken = await loginAs(api.request, await createAdmin());
  const creds = { email: "vende@test.local", password: "Vendedora123" };
  await admin("POST", "/api/admin/referrals", { body: { name: "Ana", ...creds } });
  refToken = await loginAs(api.request, creds);
});

after(async () => {
  await api.close();
  await sequelize.close();
});

describe("medios de pago", () => {
  test("se valida el tipo y el número", async () => {
    assert.equal((await admin("POST", "/api/admin/payment-methods", { body: { type: "paypal", reference: "x" } })).status, 400);
    assert.equal((await admin("POST", "/api/admin/payment-methods", { body: { type: "yape" } })).status, 400);
  });

  test("cada vendedor tiene los suyos y no ve los del otro", async () => {
    const mio = await admin("POST", "/api/admin/payment-methods", {
      body: { type: "yape", reference: "900266553", holder: "Jampier V." },
    });
    assert.equal(mio.status, 201);
    assert.equal(mio.body.typeLabel, "Yape");

    await referral("POST", "/api/admin/payment-methods", { body: { type: "plin", reference: "987654321" } });

    const mios = await admin("GET", "/api/admin/payment-methods");
    assert.deepEqual(mios.body.items.map((m) => m.type), ["yape"]);
    const suyos = await referral("GET", "/api/admin/payment-methods");
    assert.deepEqual(suyos.body.items.map((m) => m.type), ["plin"]);

    // Tampoco puede editar ni borrar uno ajeno.
    assert.equal((await referral("PATCH", `/api/admin/payment-methods/${mio.body.id}`, { body: { reference: "1" } })).status, 404);
    assert.equal((await referral("DELETE", `/api/admin/payment-methods/${mio.body.id}`)).status, 404);
  });

  test("el referido ve con qué pagarle al dueño", async () => {
    const res = await referral("GET", "/api/admin/owner-payment-methods");
    assert.equal(res.status, 200);
    assert.equal(res.body.owner.name, "Admin");
    assert.deepEqual(res.body.methods.map((m) => m.reference), ["900266553"]);
  });

  test("se puede editar y borrar el propio", async () => {
    const creado = await referral("POST", "/api/admin/payment-methods", { body: { type: "bim", reference: "111222333" } });
    const editado = await referral("PATCH", `/api/admin/payment-methods/${creado.body.id}`, { body: { notes: "Solo mañanas" } });
    assert.equal(editado.body.notes, "Solo mañanas");
    assert.equal((await referral("DELETE", `/api/admin/payment-methods/${creado.body.id}`)).status, 204);
    assert.equal((await referral("GET", "/api/admin/payment-methods")).body.items.length, 1);
  });
});

describe("catálogo del vendedor", () => {
  test("muestra el costo y guarda su precio de venta", async () => {
    await admin("PATCH", "/api/admin/templates/yellow-flowers", { body: { referralPrice: 5 } });

    const catalogo = await referral("GET", "/api/admin/my-catalog");
    const flores = catalogo.body.items.find((t) => t.templateId === "yellow-flowers");
    assert.equal(flores.cost, 5);
    assert.equal(flores.salePrice, null);

    const guardado = await referral("PUT", "/api/admin/my-catalog/yellow-flowers", { body: { salePrice: 25 } });
    assert.equal(guardado.body.items.find((t) => t.templateId === "yellow-flowers").salePrice, 25);
    assert.equal((await referral("PUT", "/api/admin/my-catalog/yellow-flowers", { body: { salePrice: -1 } })).status, 400);
    assert.equal((await referral("PUT", "/api/admin/my-catalog/inventada", { body: { salePrice: 5 } })).status, 404);
  });

  test("un regalo nuevo nace con ese precio de venta", async () => {
    const gift = await referral("POST", "/api/admin/gifts", { body: { templateId: "yellow-flowers", recipientName: "Rosa" } });
    assert.equal(gift.body.salePrice, 25);

    // El del dueño no hereda el precio del referido.
    const suyo = await admin("POST", "/api/admin/gifts", { body: { templateId: "yellow-flowers", recipientName: "Rosa" } });
    assert.equal(suyo.body.salePrice, null);
  });
});
