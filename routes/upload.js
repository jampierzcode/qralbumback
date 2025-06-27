const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const { uploadFile } = require("../controllers/uploadController");

// Acepta múltiples archivos
const upload = multer({ dest: "uploads/" });

router.post("/:uuid", auth, upload.array("files", 20), uploadFile);

module.exports = router;
