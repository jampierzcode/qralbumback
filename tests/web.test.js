const path = require("node:path");
process.env.WEB_DIST_DIR = path.join(__dirname, "fixtures", "web");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let token;
let slug;
const admin = (method, url, opts = {}) => api.request(method, url, { token, ...opts });

before(async () => {
  await resetDatabase();
  api = await startServer();
  token = await loginAs(api.request, await createAdmin());
  const gift = await admin("POST", "/api/admin/gifts", {
    body: { templateId: "yellow-flowers", recipientName: 'Ana <script>alert("x")</script>', senderName: "Leo" },
  });
  const img = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fc0" } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("kind", "image");
  form.append("file", new Blob([img], { type: "image/jpeg" }), "a.jpg");
  const photo = await admin("POST", `/api/admin/gifts/${gift.body.id}/media`, { form });
  await admin("PATCH", `/api/admin/gifts/${gift.body.id}`, { body: { content: { message: "Hola hola", photos: [{ assetId: photo.body.id }] } } });
  await admin("POST", `/api/admin/gifts/${gift.body.id}/status`, { body: { status: "published" } });
  slug = gift.body.slug;
});

after(async () => {
  await api.close();
  await sequelize.close();
});

test("/g/:slug entrega el frontend con Open Graph del regalo y escapa HTML", async () => {
  const res = await api.request("GET", `/g/${slug}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.text, /<meta property="og:title" content="Un regalo para Ana &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; 💛"/);
  assert.match(res.text, /og:description" content="Leo preparó algo especial/);
  assert.match(res.text, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/media\/[0-9a-f-]+\/md\.webp"/);
  assert.match(res.text, /noindex/);
  assert.ok(!res.text.includes("<script>alert"), "HTML sin escapar");
  assert.equal((res.text.match(/<title>/g) || []).length, 1);
});

test("regalo inexistente: 404 con la SPA (mensaje amable) y noindex", async () => {
  const res = await api.request("GET", "/g/noexiste");
  assert.equal(res.status, 404);
  assert.match(res.text, /<div id="root">/);
  assert.match(res.text, /noindex/);
});

test("rutas del SPA y assets; la API sigue respondiendo JSON", async () => {
  const spa = await api.request("GET", "/admin/gifts");
  assert.equal(spa.status, 200);
  assert.match(spa.text, /noindex/);
  const portal = await api.request("GET", "/upload/abc.def");
  assert.match(portal.text, /noindex/);
  const asset = await api.request("GET", "/assets/app.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  const apiMissing = await api.request("GET", "/api/no-existe");
  assert.equal(apiMissing.status, 404);
  assert.equal(apiMissing.body.error, "Recurso no encontrado.");
});

test("cabeceras de seguridad con CSP compatible con el visor", async () => {
  const res = await api.request("GET", `/g/${slug}`);
  const csp = res.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.ok(!/upgrade-insecure-requests/.test(csp));
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
