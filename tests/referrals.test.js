const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let adminToken;
let refToken;
let refId;
let otherToken;
const admin = (method, url, opts = {}) => api.request(method, url, { token: adminToken, ...opts });
const referral = (method, url, opts = {}) => api.request(method, url, { token: refToken, ...opts });

const CREDS = { email: "vendedor@test.local", password: "Vendedor123" };

async function newGift(request, body = {}) {
  const res = await request("POST", "/api/admin/gifts", {
    body: { templateId: "love-letter", recipientName: "Sofía", ...body },
  });
  assert.equal(res.status, 201, res.text);
  return res.body;
}

async function complete(request, giftId) {
  await request("PATCH", `/api/admin/gifts/${giftId}`, { body: { content: { message: "Un mensaje de prueba" } } });
}

before(async () => {
  await resetDatabase();
  api = await startServer();
  adminToken = await loginAs(api.request, await createAdmin());

  const created = await admin("POST", "/api/admin/referrals", {
    body: { name: "Vendedor", email: CREDS.email, password: CREDS.password, phone: "987654321" },
  });
  assert.equal(created.status, 201, created.text);
  refId = created.body.id;
  refToken = await loginAs(api.request, CREDS);

  const other = { email: "otro@test.local", password: "Vendedor123" };
  await admin("POST", "/api/admin/referrals", { body: { name: "Otro", ...other } });
  otherToken = await loginAs(api.request, other);

  await admin("PATCH", "/api/admin/templates/love-letter", { body: { referralPrice: 10 } });
});

after(async () => {
  await api.close();
  await sequelize.close();
});

describe("cuentas de referido", () => {
  test("se crean con validaciones y no se duplica el correo", async () => {
    const short = await admin("POST", "/api/admin/referrals", { body: { name: "X", email: "x@test.local", password: "123" } });
    assert.equal(short.status, 400);
    const dup = await admin("POST", "/api/admin/referrals", { body: { name: "X", email: CREDS.email, password: "Segura123" } });
    assert.equal(dup.status, 409);
  });

  test("un referido no puede administrar el catálogo ni ver a otros referidos", async () => {
    assert.equal((await referral("GET", "/api/admin/referrals")).status, 403);
    assert.equal((await referral("PATCH", "/api/admin/templates/love-letter", { body: { referralPrice: 1 } })).status, 403);
    assert.equal((await referral("POST", "/api/admin/collections", { body: { name: "Mía" } })).status, 403);
  });

  test("una cuenta desactivada ya no entra", async () => {
    const off = { email: "pausa@test.local", password: "Vendedor123" };
    const created = await admin("POST", "/api/admin/referrals", { body: { name: "Pausa", ...off } });
    await admin("PATCH", `/api/admin/referrals/${created.body.id}`, { body: { isActive: false } });
    const res = await api.request("POST", "/api/auth/login", { body: off });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /desactivada/i);
  });
});

describe("regalos de un referido", () => {
  let giftId;

  test("solo ve los suyos", async () => {
    const mine = await newGift(referral);
    giftId = mine.id;
    await newGift(admin);
    await newGift((m, u, o) => api.request(m, u, { token: otherToken, ...o }));

    const list = await referral("GET", "/api/admin/gifts");
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].id, giftId);

    const others = (await admin("GET", "/api/admin/gifts")).body.items.filter((g) => g.id !== giftId);
    assert.ok(others.length >= 2);
    assert.equal((await referral("GET", `/api/admin/gifts/${others[0].id}`)).status, 404);
    assert.equal((await referral("PATCH", `/api/admin/gifts/${others[0].id}`, { body: { senderName: "Hack" } })).status, 404);
    assert.equal((await referral("POST", `/api/admin/gifts/${others[0].id}/status`, { body: { status: "published" } })).status, 404);
  });

  test("sin aprobación no hay link ni publicación", async () => {
    const mine = await referral("GET", `/api/admin/gifts/${giftId}`);
    assert.equal(mine.body.slug, null);
    assert.equal(mine.body.canShare, false);
    assert.equal(mine.body.reviewStatus, "none");

    const pub = await referral("POST", `/api/admin/gifts/${giftId}/status`, { body: { status: "published" } });
    assert.equal(pub.status, 403);
    assert.match(pub.body.error, /aprobación/i);
  });

  test("enviar a aprobación toma el precio de la plantilla", async () => {
    await complete(referral, giftId);
    const sent = await referral("POST", `/api/admin/gifts/${giftId}/submit`, { body: { note: "Ya te yapeé" } });
    assert.equal(sent.status, 200, sent.text);
    assert.equal(sent.body.reviewStatus, "pending");
    assert.equal(sent.body.price, 10);
    assert.equal(sent.body.slug, null);
    assert.ok(sent.body.submittedAt);

    const again = await referral("POST", `/api/admin/gifts/${giftId}/submit`);
    assert.equal(again.status, 409);
  });

  test("el comprobante de pago no se mezcla con las fotos del regalo", async () => {
    const buffer = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#7ed957" } }).jpeg().toBuffer();
    const form = new FormData();
    form.append("kind", "image");
    form.append("file", new Blob([buffer], { type: "image/jpeg" }), "yape.jpg");
    const res = await referral("POST", `/api/admin/gifts/${giftId}/payment-proof`, { form });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.hasPaymentProof, true);
    assert.equal(res.body.media.length, 0);

    const proof = await admin("GET", `/api/admin/gifts/${giftId}/payment-proof`);
    assert.equal(proof.status, 200);
    assert.ok(proof.body.url);
  });

  test("el referido no puede aprobar su propio regalo", async () => {
    const res = await referral("POST", `/api/admin/gifts/${giftId}/review`, { body: { action: "approve" } });
    assert.equal(res.status, 403);
  });

  test("al aprobar se publica y recién ahí aparece el link", async () => {
    const pendientes = await admin("GET", "/api/admin/gifts?reviewStatus=pending");
    assert.equal(pendientes.body.items.length, 1);
    assert.equal(pendientes.body.items[0].createdBy.name, "Vendedor");

    const ok = await admin("POST", `/api/admin/gifts/${giftId}/review`, { body: { action: "approve" } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.reviewStatus, "approved");
    assert.equal(ok.body.status, "published");

    const mine = await referral("GET", `/api/admin/gifts/${giftId}`);
    assert.match(mine.body.slug, /^[2-9a-z]{8}$/);
    assert.equal(mine.body.canShare, true);

    const publico = await api.request("GET", `/api/public/gifts/${mine.body.slug}`);
    assert.equal(publico.status, 200);
  });

  test("rechazar deja el motivo y quita el link", async () => {
    const otro = await newGift(referral, { recipientName: "Luis" });
    await complete(referral, otro.id);
    await referral("POST", `/api/admin/gifts/${otro.id}/submit`);
    const no = await admin("POST", `/api/admin/gifts/${otro.id}/review`, { body: { action: "reject", note: "Falta el pago" } });
    assert.equal(no.body.reviewStatus, "rejected");
    assert.equal(no.body.reviewNote, "Falta el pago");
    assert.equal((await referral("GET", `/api/admin/gifts/${otro.id}`)).body.slug, null);
  });
});

describe("cuenta por pagar", () => {
  test("suma lo aprobado y descuenta lo que marcas como pagado", async () => {
    const cuenta = await referral("GET", "/api/admin/account");
    assert.equal(cuenta.status, 200);
    assert.equal(cuenta.body.summary.owed, 10);
    assert.equal(cuenta.body.summary.paid, 0);
    assert.equal(cuenta.body.unpaidGifts.length, 1);

    const giftId = cuenta.body.unpaidGifts[0].id;
    await admin("POST", `/api/admin/gifts/${giftId}/paid`, { body: { paid: true } });

    const despues = await referral("GET", "/api/admin/account");
    assert.equal(despues.body.summary.owed, 0);
    assert.equal(despues.body.summary.paid, 10);

    const lista = await admin("GET", "/api/admin/referrals");
    const yo = lista.body.items.find((r) => r.id === refId);
    assert.equal(yo.approved, 1);
    assert.equal(yo.paid, 10);
    assert.equal(yo.owed, 0);
  });
});
