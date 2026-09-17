// Portal del comprador: /upload/:token en el frontend.
// Sin sesión: el token firmado sólo da acceso a los campos permitidos de UN regalo.
const router = require("express").Router();
const { portalLimiter, portalUploadLimiter } = require("../middleware/rateLimits");
const { createUploader, cleanupTempFiles } = require("../middleware/upload");
const contentRequests = require("../services/contentRequests");

const uploadOne = createUploader({ maxFileSizeMB: 150, maxFiles: 1 }).single("file");

router.use(portalLimiter);
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex");
  next();
});

router.get("/:token", async (req, res) => res.json(await contentRequests.portalView(req.params.token)));

router.patch("/:token/content", async (req, res) => res.json(await contentRequests.updateContent(req.params.token, req.body?.values)));

router.post("/:token/media", portalUploadLimiter, uploadOne, async (req, res) => {
  try {
    res.status(201).json(
      await contentRequests.addMedia(req.params.token, {
        file: req.file,
        expectedKind: req.body?.kind,
        durationSec: Number(req.body?.durationSec),
      })
    );
  } finally {
    await cleanupTempFiles(req);
  }
});

router.delete("/:token/media/:assetId", async (req, res) => {
  await contentRequests.removeMedia(req.params.token, req.params.assetId);
  res.status(204).end();
});

router.post("/:token/payment-proof", portalUploadLimiter, uploadOne, async (req, res) => {
  try {
    res.status(201).json(await contentRequests.addPaymentProof(req.params.token, req.file));
  } finally {
    await cleanupTempFiles(req);
  }
});

router.post("/:token/submit", async (req, res) => res.json(await contentRequests.submit(req.params.token)));

module.exports = router;
