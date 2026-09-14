const router = require("express").Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const {
  getClients,
  createClient,
  getFilesByType,
  deleteClient,
  getClientsWithMultimedia,
} = require("../controllers/clientController");

const admin = [auth, requireRole("superadmin", "admin")];

router.get("/", admin, getClients);
router.post("/", admin, createClient);
router.get("/with/multimedia/all", admin, getClientsWithMultimedia);
// Público: lo usa la vista del álbum. Sólo expone id, tipo, url y nombre.
router.get("/:uuid/files", getFilesByType);
router.delete("/:id", admin, deleteClient);
// Eliminados: GET /:uuid (exponía email y contraseña) y PUT /:id (no hacía nada).

module.exports = router;
