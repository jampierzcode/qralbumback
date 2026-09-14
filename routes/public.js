const router = require("express").Router();
const { eventsLimiter, responsesLimiter } = require("../middleware/rateLimits");
const publicGifts = require("../services/publicGifts");
const responses = require("../services/responses");

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

// Links antiguos /c/:uuid → slug nuevo
router.get("/legacy/:uuid", async (req, res) => res.json(await publicGifts.resolveLegacyUuid(req.params.uuid)));

module.exports = router;
