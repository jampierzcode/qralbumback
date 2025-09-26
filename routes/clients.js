// routes/clientRoutes.js
const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  getClients,
  createClient,
  getClientByUUID,
  updateMaxFiles,
  getFilesByType,
  deleteClient,
  getClientsWithMultimedia, // 👈 nueva función
} = require("../controllers/clientController");

router.get("/", auth, getClients);
router.post("/", auth, createClient);
router.get("/:uuid", getClientByUUID);
router.get("/:uuid/files", getFilesByType);
router.put("/:id", auth, updateMaxFiles);
router.delete("/:id", auth, deleteClient);
router.get("/with/multimedia/all", auth, getClientsWithMultimedia); // 👈 nueva ruta

module.exports = router;
