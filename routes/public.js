const router = require("express").Router();
const { eventsLimiter, responsesLimiter, ordersLimiter } = require("../middleware/rateLimits");
const publicGifts = require("../services/publicGifts");
const responses = require("../services/responses");
const orders = require("../services/orders");

// Regalos publicados: el visor /g/:slug
router.get("/gifts/:slug", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await publicGifts.getPublishedGift(req.params.slug));
});

// Analítica básica (aperturas). Nunca en modo preview.
router.post("/gifts/:slug/events", eventsLimiter, async (req, res) => {
  await publicGifts.recordEvent(req.params.slug, req.body?.type);
  res.status(204).end();
});

// Respuestas de visitantes (ej. confirmación de asistencia).
router.post("/gifts/:slug/responses", responsesLimiter, async (req, res) => {
  res.status(201).json(await responses.createResponse(req.params.slug, req.body));
});

// Lista de invitados: el link que el comprador comparte consigo mismo para ver cómo va.
router.get("/guest-list/:token", eventsLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await responses.guestList(req.params.token));
});

// Tienda pública del vendedor: /pedir/:handle
router.get("/store/:handle", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await orders.publicStore(req.params.handle));
});
router.post("/store/:handle/orders", ordersLimiter, async (req, res) => res.status(201).json(await orders.startOrder(req.params.handle, req.body)));

// Links antiguos /c/:uuid → slug nuevo
router.get("/legacy/:uuid", async (req, res) => res.json(await publicGifts.resolveLegacyUuid(req.params.uuid)));

module.exports = router;
