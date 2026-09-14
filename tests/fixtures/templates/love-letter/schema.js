import { defineSchema, f } from "../../../../../qralbumfront/gift-core/index.js";

export default defineSchema({
  version: 2,
  fields: {
    recipientName: f.text({ label: "Nombre" }),
    senderName: f.text({ label: "De parte de" }),
    message: f.textarea({ label: "Mensaje", max: 500 }),
    photos: f.images({ label: "Fotos", max: 8 }),
    song: f.audio({ label: "Canción" }),
  },
});
