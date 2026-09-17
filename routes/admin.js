const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { createUploader, cleanupTempFiles } = require("../middleware/upload");
const gifts = require("../services/gifts");
const customers = require("../services/customers");
const catalog = require("../services/catalog");
const contentRequests = require("../services/contentRequests");
const responses = require("../services/responses");
const referrals = require("../services/referrals");
const sellers = require("../services/sellers");
const orders = require("../services/orders");

// Los referidos entran al mismo panel, pero sólo ven lo suyo (el scope va en cada servicio).
router.use(auth, requireRole("superadmin", "admin", "referido"));
const adminOnly = requireRole("superadmin", "admin");

// Para rutas que cuelgan de un regalo y no pasan por el servicio de regalos.
const ownGift = async (req, res, next) => {
  try {
    gifts.assertOwnership(await gifts.findGiftOr404(req.params.id), req.user);
    next();
  } catch (err) {
    next(err);
  }
};

// Un archivo por petición: permite progreso individual y reintentos en el cliente.
const uploadOne = createUploader({ maxFileSizeMB: 150, maxFiles: 1 }).single("file");

router.get("/dashboard", async (req, res) => res.json(await gifts.dashboard(req.user)));

// ── Clientes ────────────────────────────────────────────────────────────────
router.get("/customers", async (req, res) => res.json({ items: await customers.listCustomers(req.query, req.user) }));
router.post("/customers", async (req, res) => res.status(201).json(await customers.createCustomer(req.body, req.user)));
router.get("/customers/:id", async (req, res) => res.json(await customers.getCustomer(req.params.id, req.user)));
router.patch("/customers/:id", async (req, res) => res.json(await customers.updateCustomer(req.params.id, req.body, req.user)));

// ── Regalos ─────────────────────────────────────────────────────────────────
router.get("/gifts", async (req, res) => res.json(await gifts.listGifts(req.query, req.user)));
router.post("/gifts", async (req, res) => res.status(201).json(await gifts.createGift(req.body, req.user)));
router.get("/gifts/:id", async (req, res) => res.json(await gifts.getGift(req.params.id, req.user)));
router.patch("/gifts/:id", async (req, res) => res.json(await gifts.updateGift(req.params.id, req.body, req.user)));
router.post("/gifts/:id/status", async (req, res) => res.json(await gifts.setStatus(req.params.id, req.body?.status, req.user)));
router.post("/gifts/:id/duplicate", async (req, res) => res.status(201).json(await gifts.duplicateGift(req.params.id, req.user)));

// ── Referidos: aprobación y pagos ──────────────────────────────────────────
// El referido envía su regalo a aprobación; tú apruebas (se publica) o rechazas.
router.post("/gifts/:id/submit", async (req, res) => res.json(await referrals.submitForReview(req.params.id, req.body, req.user)));
router.post("/gifts/:id/payment-proof", uploadOne, async (req, res) => {
  try {
    res.status(201).json(await referrals.attachPaymentProof(req.params.id, req.file, req.user));
  } finally {
    await cleanupTempFiles(req);
  }
});
router.get("/gifts/:id/payment-proof", async (req, res) => res.json(await referrals.getPaymentProof(req.params.id, req.user)));
router.post("/gifts/:id/review", adminOnly, async (req, res) => res.json(await referrals.review(req.params.id, req.body, req.user)));
router.post("/gifts/:id/paid", adminOnly, async (req, res) => res.json(await referrals.setPaid(req.params.id, req.body?.paid !== false)));

router.get("/referrals", adminOnly, async (req, res) => res.json(await referrals.listReferrals()));
router.post("/referrals", adminOnly, async (req, res) => res.status(201).json(await referrals.createReferral(req.body)));
router.patch("/referrals/:id", adminOnly, async (req, res) => res.json(await referrals.updateReferral(req.params.id, req.body)));
router.get("/referrals/:id/account", adminOnly, async (req, res) => res.json(await referrals.account(Number(req.params.id))));
// Cuenta del referido que entró (cuánto te debe y qué ya pagó).
router.get("/account", async (req, res) => res.json(await referrals.account(req.user.id)));

// ── Mi negocio: cómo me pagan y a cuánto vendo ─────────────────────────────
router.get("/payment-methods", async (req, res) => res.json({ items: await sellers.listMethods(req.user.id) }));
router.post("/payment-methods", async (req, res) => res.status(201).json(await sellers.createMethod(req.user.id, req.body)));
router.patch("/payment-methods/:id", async (req, res) => res.json(await sellers.updateMethod(req.user.id, req.params.id, req.body)));
router.delete("/payment-methods/:id", async (req, res) => {
  await sellers.deleteMethod(req.user.id, req.params.id);
  res.status(204).end();
});
// Datos con los que el referido le paga al dueño.
router.get("/owner-payment-methods", async (req, res) => res.json(await sellers.ownerMethods()));

// Mi tienda pública (link para recibir pedidos)
router.get("/store", async (req, res) => res.json(await orders.getStore(req.user.id)));
router.patch("/store", async (req, res) => res.json(await orders.updateStore(req.user.id, req.body)));
router.get("/gifts/:id/client-proof", async (req, res) => res.json(await orders.clientProof(req.params.id, req.user)));
router.post("/gifts/:id/order-review", async (req, res) => res.json(await orders.reviewOrder(req.params.id, req.body, req.user)));

router.get("/my-catalog", async (req, res) => res.json({ items: await sellers.catalogFor(req.user.id) }));
router.put("/my-catalog/:templateId", async (req, res) =>
  res.json({ items: await sellers.setSalePrice(req.user.id, req.params.templateId, req.body?.salePrice) })
);

router.post("/gifts/:id/media", uploadOne, async (req, res) => {
  try {
    const asset = await gifts.addMedia(req.params.id, {
      file: req.file,
      uploadedBy: req.user.role === "referido" ? "referral" : "admin",
      expectedKind: req.body?.kind,
      durationSec: Number(req.body?.durationSec),
    }, req.user);
    res.status(201).json(asset);
  } finally {
    await cleanupTempFiles(req);
  }
});
router.delete("/gifts/:id/media/:assetId", async (req, res) => {
  await gifts.removeMedia(req.params.id, req.params.assetId, req.user);
  res.status(204).end();
});

// ── Respuestas de invitados (confirmaciones) ───────────────────────────────
router.get("/gifts/:id/responses", ownGift, async (req, res) => res.json(await responses.listResponses(req.params.id, req.query.type)));
router.delete("/gifts/:id/responses/:responseId", ownGift, async (req, res) => {
  await responses.deleteResponse(req.params.id, req.params.responseId);
  res.status(204).end();
});

// ── Solicitar contenido al cliente (portal privado) ────────────────────────
router.get("/gifts/:id/content-requests", ownGift, async (req, res) => res.json({ items: await contentRequests.listRequests(req.params.id) }));
router.post("/gifts/:id/content-requests", ownGift, async (req, res) =>
  res.status(201).json(await contentRequests.createRequest(req.params.id, req.body))
);
router.post("/content-requests/:id/revoke", async (req, res) => res.json(await contentRequests.revokeRequest(req.params.id, req.user)));

// ── Plantillas (el código vive en el repo; aquí sólo lo comercial) ─────────
router.get("/templates", async (req, res) => res.json({ items: await catalog.listTemplates() }));
router.put("/templates/order", adminOnly, async (req, res) =>
  res.json({ items: await catalog.reorderTemplates(req.body?.templateIds) })
);
router.patch("/templates/:templateId", adminOnly, async (req, res) =>
  res.json(await catalog.updateTemplate(req.params.templateId, req.body))
);

// ── Colecciones ─────────────────────────────────────────────────────────────
const uploadCover = createUploader({ maxFileSizeMB: 25, maxFiles: 1, allowedKinds: ["image"] }).single("file");

router.get("/collections", async (req, res) => res.json({ items: await catalog.listCollections() }));
router.post("/collections", adminOnly, async (req, res) => res.status(201).json(await catalog.createCollection(req.body)));
router.put("/collections/order", adminOnly, async (req, res) =>
  res.json({ items: await catalog.reorderCollections(req.body?.ids) })
);
router.patch("/collections/:id", adminOnly, async (req, res) => res.json(await catalog.updateCollection(req.params.id, req.body)));
router.put("/collections/:id/templates", adminOnly, async (req, res) =>
  res.json(await catalog.setCollectionTemplates(req.params.id, req.body?.templateIds))
);
router.post("/collections/:id/cover", adminOnly, uploadCover, async (req, res) => {
  try {
    res.json(await catalog.setCollectionCover(req.params.id, req.file));
  } finally {
    await cleanupTempFiles(req);
  }
});

module.exports = router;
