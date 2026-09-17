const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let token;
let invitation;
let flowers;
const admin = (method, url, opts = {}) => api.request(method, url, { token, ...opts });
const lista_token_falso = (t) => `${t.slice(0, -1)}${t.at(-1) === "A" ? "B" : "A"}`;
const rsvp = (slug, body) => api.request("POST", `/api/public/gifts/${slug}/responses`, { body: { type: "rsvp", ...body } });

async function publishedGift(templateId, content = {}) {
  const gift = await admin("POST", "/api/admin/gifts", { body: { templateId, recipientName: "Mateo" } });
  await sequelize.query("UPDATE Gifts SET status = 'published', content = ? WHERE id = ?", { replacements: [JSON.stringify(content), gift.body.id] });
  return gift.body;
}

before(async () => {
  await resetDatabase();
  api = await startServer();
  token = await loginAs(api.request, await createAdmin());
  invitation = await publishedGift("love-letter"); // el fixture declara collectsResponses: ["rsvp"]
  flowers = await publishedGift("yellow-flowers");
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("confirmación válida se guarda y el admin ve el resumen", async () => {
  assert.equal((await rsvp(invitation.slug, { name: "Ana", answer: "yes", guests: 3, message: "¡Ahí estaremos!" })).status, 201);
  assert.equal((await rsvp(invitation.slug, { name: "Luis", answer: "maybe", guests: 2 })).status, 201);
  assert.equal((await rsvp(invitation.slug, { name: "Rosa", answer: "no", guests: 5 })).status, 201);

  const res = await admin("GET", `/api/admin/gifts/${invitation.id}/responses`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.summary, { yes: 1, maybe: 1, no: 1, guestsYes: 3, guestsMaybe: 2 });
  assert.equal(res.body.items.find((r) => r.name === "Rosa").guests, 0, "quien no va cuenta 0 personas");
});

test("la misma persona actualiza su respuesta en vez de duplicarla", async () => {
  const res = await rsvp(invitation.slug, { name: "Luis", answer: "yes", guests: 2 });
  assert.equal(res.body.updated, true);
  const list = await admin("GET", `/api/admin/gifts/${invitation.id}/responses`);
  assert.equal(list.body.items.filter((r) => r.name === "Luis").length, 1);
  assert.equal(list.body.summary.guestsYes, 5);
});

test("validaciones con mensajes claros", async () => {
  assert.match((await rsvp(invitation.slug, { name: " ", answer: "yes" })).body.error, /nombre/);
  assert.match((await rsvp(invitation.slug, { name: "X", answer: "quizas" })).body.error, /asistir/);
  assert.equal((await rsvp(invitation.slug, { name: "X", answer: "yes", guests: 99 })).status, 400);
});

test("plantillas que no declaran respuestas, regalos no publicados y confirmaciones cerradas", async () => {
  assert.equal((await rsvp(flowers.slug, { name: "Ana", answer: "yes" })).status, 400);
  assert.equal((await rsvp("noexiste", { name: "Ana", answer: "yes" })).status, 404);
  const closed = await publishedGift("love-letter", { rsvpEnabled: false });
  assert.equal((await rsvp(closed.slug, { name: "Ana", answer: "yes" })).status, 409);
});

test("el admin puede borrar una respuesta y exige sesión", async () => {
  const list = await admin("GET", `/api/admin/gifts/${invitation.id}/responses`);
  const target = list.body.items[0];
  assert.equal((await api.request("GET", `/api/admin/gifts/${invitation.id}/responses`)).status, 401);
  assert.equal((await admin("DELETE", `/api/admin/gifts/${invitation.id}/responses/${target.id}`)).status, 204);
  const after = await admin("GET", `/api/admin/gifts/${invitation.id}/responses`);
  assert.equal(after.body.items.length, list.body.items.length - 1);
});

test("la lista de invitados se abre con su propio link, sin cuenta", async () => {
  const gift = await admin("GET", `/api/admin/gifts/${invitation.id}`);
  const token = gift.body.guestListToken;
  assert.match(token, /^[A-Za-z0-9_-]{22}~[A-Za-z0-9_-]{32}$/);

  const lista = await api.request("GET", `/api/public/guest-list/${token}`);
  assert.equal(lista.status, 200);
  assert.equal(lista.body.gift.recipientName, gift.body.recipientName);
  assert.equal(lista.body.summary.yes + lista.body.summary.maybe + lista.body.summary.no, lista.body.items.length);
  // No se filtra nada del regalo ni del negocio.
  assert.equal(lista.body.gift.slug, undefined);
  assert.equal(lista.body.gift.price, undefined);

  // Un token manipulado no abre nada.
  assert.equal((await api.request("GET", `/api/public/guest-list/${lista_token_falso(token)}`)).status, 404);

  // Una plantilla sin confirmaciones no tiene lista.
  const sinLista = await admin("GET", `/api/admin/gifts/${flowers.id}`);
  assert.equal(sinLista.body.guestListToken, null);
});
