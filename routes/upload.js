const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { createUploader } = require("../middleware/upload");
const { uploadFile, deleteFile } = require("../controllers/uploadController");

const admin = [auth, requireRole("superadmin", "admin")];
const upload = createUploader({ maxFileSizeMB: 100, maxFiles: 20 });

router.post("/:uuid", admin, upload.array("files", 20), uploadFile);
router.delete("/:id", admin, deleteFile);

module.exports = router;
