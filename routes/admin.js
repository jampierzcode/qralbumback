const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { createUploader, cleanupTempFiles } = require("../middleware/upload");
const gifts = require("../services/gifts");
const customers = require("../services/customers");

router.use(auth, requireRole("superadmin", "admin"));

// Un archivo por petición: permite progreso individual y reintentos en el cliente.
const uploadOne = createUploader({ maxFileSizeMB: 150, maxFiles: 1 }).single("file");

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

module.exports = router;
