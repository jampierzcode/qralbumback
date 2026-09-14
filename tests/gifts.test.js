const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { QueryTypes } = require("sequelize");
const { sequelize, resetDatabase, startServer, createAdmin, loginAs } = require("./helpers");

let api;
let token;
const req = (method, url, opts = {}) => api.request(method, url, { token, ...opts });

async function jpegWithExif() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#f4c430" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "SECRETO-EXIF", Artist: "Ubicación privada" } })
    .toBuffer();
}

function fileForm(buffer, { name, type, kind }) {
  const form = new FormData();
  if (kind) form.append("kind", kind);
  form.append("file", new Blob([buffer], { type }), name);
  return form;
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

describe("clientes", () => {
  test("se crean sin contraseña y con validaciones humanas", async () => {
    const bad = await req("POST", "/api/admin/customers", { body: { phone: "999" } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /nombre es obligatorio/i);

    const res = await req("POST", "/api/admin/customers", {
      body: { name: "Carla Ruiz", phone: "+51 987 654 321", email: "carla@example.com" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.phone, "+51987654321");
    assert.ok(!("password" in res.body));
  });

  test("listado incluye número de regalos y último regalo", async () => {
    const list = await req("GET", "/api/admin/customers");
    const carla = list.body.items.find((c) => c.name === "Carla Ruiz");
    assert.equal(carla.giftsCount, 0);

    await req("POST", "/api/admin/gifts", { body: { templateId: "yellow-flowers", customerId: carla.id } });
    const again = await req("GET", "/api/admin/customers?q=carla");
    assert.equal(again.body.items[0].giftsCount, 1);
    assert.ok(again.body.items[0].lastGiftAt);

    const detail = await req("GET", `/api/admin/customers/${carla.id}`);
    assert.equal(detail.body.gifts.length, 1);
    assert.equal(detail.body.activity[0].type, "gift_created");
  });
});

describe("regalos", () => {
  let giftId;

  test("crear exige plantilla y genera slug corto", async () => {
    const bad = await req("POST", "/api/admin/gifts", { body: {} });
    assert.equal(bad.status, 400);

    const res = await req("POST", "/api/admin/gifts", {
      body: { templateId: "love-letter", recipientName: "Sofía", senderName: "Mateo", occasion: "aniversario" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "draft");
    assert.match(res.body.slug, /^[2-9a-z]{8}$/);
    assert.equal(res.body.recipientName, "Sofía");
    giftId = res.body.id;
  });

  test("editar básicos, contenido y estado", async () => {
    const res = await req("PATCH", `/api/admin/gifts/${giftId}`, {
      body: { content: { message: "Hola" }, settings: { theme: "night" }, senderName: "Mateo R." },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.content.message, "Hola");
    assert.equal(res.body.senderName, "Mateo R.");

    const pub = await req("POST", `/api/admin/gifts/${giftId}/status`, { body: { status: "published" } });
    assert.equal(pub.body.status, "published");
    assert.ok(pub.body.publishedAt);

    const invalid = await req("POST", `/api/admin/gifts/${giftId}/status`, { body: { status: "vendido" } });
    assert.equal(invalid.status, 400);
  });

  test("filtros de listado", async () => {
    const byQ = await req("GET", "/api/admin/gifts?q=sof");
    assert.ok(byQ.body.items.some((g) => g.id === giftId));
    const byStatus = await req("GET", "/api/admin/gifts?status=draft");
    assert.ok(!byStatus.body.items.some((g) => g.id === giftId));
    const byTemplate = await req("GET", "/api/admin/gifts?templateId=love-letter");
    assert.ok(byTemplate.body.items.every((g) => g.templateId === "love-letter"));
  });

  test("subida de imagen genera variantes WebP y elimina metadatos EXIF", async () => {
    const res = await req("POST", `/api/admin/gifts/${giftId}/media`, {
      form: fileForm(await jpegWithExif(), { name: "IMG_4938.JPG", type: "image/jpeg", kind: "image" }),
    });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.kind, "image");
    assert.equal(res.body.width, 2048);
    assert.ok(res.body.placeholder.startsWith("data:image/webp"));

    for (const variant of ["thumb", "md", "lg"]) {
      const file = await fetch(api.base + res.body.variants[variant].url);
      assert.equal(file.status, 200);
      assert.equal(file.headers.get("content-type"), "image/webp");
      const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
      assert.equal(meta.exif, undefined, `la variante ${variant} conserva EXIF`);
    }
  });

  test("rechaza archivos falsos, HEIC y tipo equivocado", async () => {
    const fake = await req("POST", `/api/admin/gifts/${giftId}/media`, {
      form: fileForm(Buffer.from("no soy una imagen, soy texto"), { name: "x.jpg", type: "image/jpeg" }),
    });
    assert.equal(fake.status, 415);

    const heicHeader = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(40)]);
    const heic = await req("POST", `/api/admin/gifts/${giftId}/media`, {
      form: fileForm(heicHeader, { name: "IMG.HEIC", type: "image/heic" }),
    });
    assert.equal(heic.status, 415);
    assert.match(heic.body.error, /HEIC/);

    const wrongKind = await req("POST", `/api/admin/gifts/${giftId}/media`, {
      form: fileForm(await jpegWithExif(), { name: "foto.jpg", type: "image/jpeg", kind: "audio" }),
    });
    assert.equal(wrongKind.status, 415);
  });

  test("audio se guarda y se sirve con soporte de Range (Safari iOS)", async () => {
    const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(4096, 1)]);
    const res = await req("POST", `/api/admin/gifts/${giftId}/media`, {
      form: fileForm(mp3, { name: "cancion.mp3", type: "audio/mpeg", kind: "audio" }),
    });
    assert.equal(res.status, 201, res.text);
    const partial = await fetch(api.base + res.body.url, { headers: { Range: "bytes=0-99" } });
    assert.equal(partial.status, 206);
  });

  test("duplicar copia contenido y reasigna referencias de media", async () => {
    const detail = await req("GET", `/api/admin/gifts/${giftId}`);
    const image = detail.body.media.find((m) => m.kind === "image");
    await req("PATCH", `/api/admin/gifts/${giftId}`, { body: { content: { photos: [{ assetId: image.id }] } } });

    const copy = await req("POST", `/api/admin/gifts/${giftId}/duplicate`);
    assert.equal(copy.status, 201);
    assert.equal(copy.body.status, "draft");
    assert.notEqual(copy.body.slug, detail.body.slug);
    const copiedImage = copy.body.media.find((m) => m.kind === "image");
    assert.notEqual(copiedImage.id, image.id);
    assert.equal(copy.body.content.photos[0].assetId, copiedImage.id);

    // Borrar la media de la copia no rompe el archivo del original (se comparte en disco).
    const del = await req("DELETE", `/api/admin/gifts/${copy.body.id}/media/${copiedImage.id}`);
    assert.equal(del.status, 204);
    const stillThere = await fetch(api.base + image.variants.thumb.url);
    assert.equal(stillThere.status, 200);
  });

  test("archivar oculta del listado por defecto", async () => {
    await req("POST", `/api/admin/gifts/${giftId}/status`, { body: { status: "archived" } });
    const list = await req("GET", "/api/admin/gifts");
    assert.ok(!list.body.items.some((g) => g.id === giftId));
    const archived = await req("GET", "/api/admin/gifts?status=archived");
    assert.ok(archived.body.items.some((g) => g.id === giftId));
  });
});

describe("migración de álbumes legados", () => {
  test("copia clientes y multimedia sin tocar el modelo anterior y es idempotente", async () => {
    const migration = require("../migrations/20260914000007-copy-legacy-albums");
    const context = { queryInterface: sequelize.getQueryInterface(), sequelize };
    const count = async (sql) => Number((await sequelize.query(sql, { type: QueryTypes.SELECT }))[0].n);

    await sequelize.query(
      "INSERT INTO Users (name, email, password, role, uuid, createdAt, updatedAt) VALUES ('Álbum Rosa', 'rosa@legacy.com', '$2b$10$abcdefghijklmnopqrstuv', 'cliente', '11111111-2222-3333-4444-555555555555', NOW(), NOW())"
    );
    const [{ id: userId }] = await sequelize.query("SELECT id FROM Users WHERE email = 'rosa@legacy.com'", { type: QueryTypes.SELECT });
    for (const [type, url] of [
      ["photo", "https://cdn.example.com/a.jpg"],
      ["photo", "https://cdn.example.com/b.png"],
      ["video", "https://cdn.example.com/c.mp4"],
      ["audio", "https://cdn.example.com/d.mp3"],
      ["audio", "https://cdn.example.com/e.mp3"],
    ]) {
      await sequelize.query("INSERT INTO Multimedia (type, url, name, userId, createdAt, updatedAt) VALUES (?, ?, 'IMG_1.JPG', ?, NOW(), NOW())", {
        replacements: [type, url, userId],
      });
    }

    const legacyUsersBefore = await count("SELECT COUNT(*) n FROM Users");
    const legacyMediaBefore = await count("SELECT COUNT(*) n FROM Multimedia");

    await migration.up({ context });
    await migration.up({ context }); // segunda vez: no debe duplicar

    const [gift] = await sequelize.query("SELECT * FROM Gifts WHERE legacyUuid = '11111111-2222-3333-4444-555555555555'", { type: QueryTypes.SELECT });
    assert.ok(gift);
    assert.equal(gift.status, "published");
    assert.equal(gift.templateId, "yellow-flowers");
    const content = typeof gift.content === "string" ? JSON.parse(gift.content) : gift.content;
    assert.equal(content.photos.length, 2);
    assert.equal(content.videos.length, 1);
    assert.ok(content.song.assetId);

    assert.equal(await count(`SELECT COUNT(*) n FROM MediaAssets WHERE giftId = '${gift.id}'`), 5);
    assert.equal(await count("SELECT COUNT(*) n FROM Customers WHERE legacyUserId IS NOT NULL"), 1);
    assert.equal(await count("SELECT COUNT(*) n FROM Users"), legacyUsersBefore);
    assert.equal(await count("SELECT COUNT(*) n FROM Multimedia"), legacyMediaBefore);
  });
});
