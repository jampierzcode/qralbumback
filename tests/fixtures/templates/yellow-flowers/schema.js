// Usa el gift-core real del frontend (repos hermanos).
import { defineSchema, f } from "../../../../../qralbumfront/gift-core/index.js";

export default defineSchema({
  version: 1,
  steps: [{ id: "main", title: "Principal" }],
  fields: {
    recipientName: f.text({ label: "Nombre", required: true, editorStep: "main" }),
    message: f.textarea({ label: "Mensaje", required: true, min: 5, max: 200, editorStep: "main" }),
    photos: f.images({ label: "Fotos", min: 1, max: 3, editorStep: "main" }),
    song: f.audio({ label: "Canción", editorStep: "main" }),
    cover: f.image({ label: "Portada", customerEditable: false }),
  },
});
