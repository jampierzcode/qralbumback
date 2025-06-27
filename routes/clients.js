const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  getClients,
  createClient,
  getClientByUUID,
  updateMaxFiles,
  getFilesByType,
} = require("../controllers/clientController");

router.get("/", auth, getClients);
router.post("/", auth, createClient);
router.get("/:uuid", getClientByUUID);
router.get("/:uuid/files", getFilesByType);
router.put("/:id", auth, updateMaxFiles);

module.exports = router;
