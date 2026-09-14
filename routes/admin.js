const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { createUploader, cleanupTempFiles } = require("../middleware/upload");
const gifts = require("../services/gifts");
const customers = require("../services/customers");
const catalog = require("../services/catalog");
const contentRequests = require("../services/contentRequests");

router.use(auth, requireRole("superadmin", "admin"));

// Un archivo por petición: permite progreso individual y reintentos en el cliente.
const uploadOne = createUploader({ maxFileSizeMB: 150, maxFiles: 1 }).single("file");

router.get("/dashboard", async (req, res) => res.json(await gifts.dashboard()));

// ── Clientes ────────────────────────────────────────────────────────────────
router.get("/customers", async (req, res) => res.json({ items: await customers.listCustomers(req.query) }));
router.post("/customers", async (req, res) => res.status(201).json(await customers.createCustomer(req.body)));
router.get("/customers/:id", async (req, res) => res.json(await customers.getCustomer(req.params.id)));
router.patch("/customers/:id", async (req, res) => res.json(await customers.updateCustomer(req.params.id, req.body)));

// ── Regalos ─────────────────────────────────────────────────────────────────
router.get("/gifts", async (req, res) => res.json(await gifts.listGifts(req.query)));
router.post("/gifts", async (req, res) => res.status(201).json(await gifts.createGift(req.body)));
router.get("/gifts/:id", async (req, res) => res.json(await gifts.getGift(req.params.id)));
router.patch("/gifts/:id", async (req, res) => res.json(await gifts.updateGift(req.params.id, req.body)));
router.post("/gifts/:id/status", async (req, res) => res.json(await gifts.setStatus(req.params.id, req.body?.status)));
router.post("/gifts/:id/duplicate", async (req, res) => res.status(201).json(await gifts.duplicateGift(req.params.id)));

router.post("/gifts/:id/media", uploadOne, async (req, res) => {
  try {
    const asset = await gifts.addMedia(req.params.id, {
      file: req.file,
      uploadedBy: "admin",
      expectedKind: req.body?.kind,
      durationSec: Number(req.body?.durationSec),
    });
    res.status(201).json(asset);
  } finally {
    await cleanupTempFiles(req);
  }
});
router.delete("/gifts/:id/media/:assetId", async (req, res) => {
  await gifts.removeMedia(req.params.id, req.params.assetId);
  res.status(204).end();
});

// ── Solicitar contenido al cliente (portal privado) ────────────────────────
router.get("/gifts/:id/content-requests", async (req, res) => res.json({ items: await contentRequests.listRequests(req.params.id) }));
router.post("/gifts/:id/content-requests", async (req, res) =>
  res.status(201).json(await contentRequests.createRequest(req.params.id, req.body))
);
router.post("/content-requests/:id/revoke", async (req, res) => res.json(await contentRequests.revokeRequest(req.params.id)));

// ── Plantillas (el código vive en el repo; aquí sólo lo comercial) ─────────
router.get("/templates", async (req, res) => res.json({ items: await catalog.listTemplates() }));
router.put("/templates/order", async (req, res) =>
  res.json({ items: await catalog.reorderTemplates(req.body?.templateIds) })
);
router.patch("/templates/:templateId", async (req, res) =>
  res.json(await catalog.updateTemplate(req.params.templateId, req.body))
);

// ── Colecciones ─────────────────────────────────────────────────────────────
const uploadCover = createUploader({ maxFileSizeMB: 25, maxFiles: 1, allowedKinds: ["image"] }).single("file");

router.get("/collections", async (req, res) => res.json({ items: await catalog.listCollections() }));
router.post("/collections", async (req, res) => res.status(201).json(await catalog.createCollection(req.body)));
router.put("/collections/order", async (req, res) =>
  res.json({ items: await catalog.reorderCollections(req.body?.ids) })
);
router.patch("/collections/:id", async (req, res) => res.json(await catalog.updateCollection(req.params.id, req.body)));
router.put("/collections/:id/templates", async (req, res) =>
  res.json(await catalog.setCollectionTemplates(req.params.id, req.body?.templateIds))
);
router.post("/collections/:id/cover", uploadCover, async (req, res) => {
  try {
    res.json(await catalog.setCollectionCover(req.params.id, req.file));
  } finally {
    await cleanupTempFiles(req);
  }
});

module.exports = router;
