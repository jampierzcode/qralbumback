// Copia (NO mueve) el modelo anterior al nuevo:
//   User rol "cliente"  → Customer + Gift publicado (plantilla yellow-flowers)
//   Multimedia          → MediaAsset externo del Gift
// Las tablas Users y Multimedia quedan intactas. Es idempotente: usa las claves
// únicas legacyUserId / legacyUuid / legacyMultimediaId para no duplicar.
const crypto = require("crypto");
const { QueryTypes } = require("sequelize");

const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const KIND = { photo: "image", video: "video", audio: "audio" };
const MIME_BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav",
};

function slug() {
  return Array.from({ length: 8 }, () => SLUG_ALPHABET[crypto.randomInt(SLUG_ALPHABET.length)]).join("");
}

function guessMime(url) {
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

module.exports = {
  async up({ context: { sequelize } }) {
    const select = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

    const clients = await select(
      "SELECT id, name, email, uuid, createdAt, updatedAt FROM Users WHERE role = 'cliente' ORDER BY id"
    );

    for (const client of clients) {
      await sequelize.transaction(async (transaction) => {
        const q = (sql, replacements) => sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT });
        const exec = (sql, replacements) => sequelize.query(sql, { replacements, transaction });

        let [customer] = await q("SELECT id FROM Customers WHERE legacyUserId = ?", [client.id]);
        if (!customer) {
          await exec(
            "INSERT INTO Customers (name, email, legacyUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
            [client.name, client.email, client.id, client.createdAt, client.updatedAt]
          );
          [customer] = await q("SELECT id FROM Customers WHERE legacyUserId = ?", [client.id]);
        }

        let [gift] = client.uuid ? await q("SELECT id FROM Gifts WHERE legacyUuid = ?", [client.uuid]) : [];
        const isNewGift = !gift;
        if (isNewGift) {
          gift = { id: crypto.randomUUID() };
          let giftSlug = slug();
          while ((await q("SELECT id FROM Gifts WHERE slug = ?", [giftSlug])).length) giftSlug = slug();
          await exec(
            `INSERT INTO Gifts (id, slug, customerId, templateId, templateVersion, status, recipientName, senderName,
               content, settings, legacyUuid, publishedAt, createdAt, updatedAt)
             VALUES (?, ?, ?, 'yellow-flowers', 1, 'published', '', '', '{}', '{}', ?, ?, ?, ?)`,
            [gift.id, giftSlug, customer.id, client.uuid, client.createdAt, client.createdAt, client.updatedAt]
          );
        }

        const files = await q("SELECT id, type, url, name, createdAt, updatedAt FROM Multimedia WHERE userId = ? ORDER BY id", [client.id]);
        const refs = { image: [], video: [], audio: [] };
        for (const file of files) {
          let [asset] = await q("SELECT id FROM MediaAssets WHERE legacyMultimediaId = ?", [file.id]);
          if (!asset) {
            asset = { id: crypto.randomUUID() };
            await exec(
              `INSERT INTO MediaAssets (id, giftId, kind, status, storage, url, mimeType, variants, originalName,
                 uploadedBy, legacyMultimediaId, createdAt, updatedAt)
               VALUES (?, ?, ?, 'ready', 'external', ?, ?, '{}', ?, 'admin', ?, ?, ?)`,
              [asset.id, gift.id, KIND[file.type], file.url, guessMime(file.url), file.name, file.id, file.createdAt, file.updatedAt]
            );
          }
          refs[KIND[file.type]].push({ assetId: asset.id });
        }

        // Sólo se arma el contenido al crear el regalo; nunca se sobrescriben ediciones posteriores.
        if (isNewGift) {
          const content = {
            title: "Flores para ti",
            message: "Te regalo estas flores y un álbum con tus recuerdos favoritos.",
            photos: refs.image,
            videos: refs.video,
            song: refs.audio[0] || null,
          };
          await exec("UPDATE Gifts SET content = ? WHERE id = ?", [JSON.stringify(content), gift.id]);
        }
      });
    }
  },

  // Revertir sólo elimina lo copiado; el modelo legado nunca se tocó.
  async down({ context: { sequelize } }) {
    await sequelize.query("DELETE FROM Gifts WHERE legacyUuid IS NOT NULL");
    await sequelize.query("DELETE FROM Customers WHERE legacyUserId IS NOT NULL");
  },
};
