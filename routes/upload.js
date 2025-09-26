const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const { uploadFile, deleteFile } = require("../controllers/uploadController");

// Acepta múltiples archivos
const upload = multer({ dest: "uploads/" });

router.post("/:uuid", auth, upload.array("files", 20), uploadFile);
router.delete("/:id", auth, deleteFile);

module.exports = router;
