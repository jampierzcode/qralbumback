const { Multimedia, User } = require("../models");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
exports.getClientsWithMultimedia = async (req, res) => {
  try {
    const clients = await User.findAll({
      where: { role: "cliente" },
      include: [{ model: Multimedia }],
    });

    res.json(clients);
  } catch (error) {
    console.error("❌ Error al traer clientes con multimedia:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};
exports.getClients = async (req, res) => {
  try {
    const clients = await User.findAll({ where: { role: "cliente" } });
    res.json(clients);
  } catch (error) {
    console.error("Error al traer clientes:", error);
    res.status(500).json({ error: "Error del servidor al obtener clientes" });
  }
};
exports.createClient = async (req, res) => {
  const { name, email, password } = req.body;
  const uuid = uuidv4();
  const newClient = await User.create({ name, uuid, email, password });

  res.json({ client: newClient });
};

exports.getClientByUUID = async (req, res) => {
  const client = await User.findOne({
    where: { uuid: req.params.uuid },
    include: [{ model: Multimedia }],
  });
  if (!client) return res.sendStatus(404);
  res.json(client);
};

exports.updateMaxFiles = async (req, res) => {
  const { maxFiles } = req.body;
  await User.update({ maxFiles }, { where: { id: req.params.id } });
  res.sendStatus(200);
};

exports.getFilesByType = async (req, res) => {
  const { uuid } = req.params;
  const { type } = req.query;

  const client = await User.findOne({ where: { uuid } });

  if (!client) return res.sendStatus(404);

  const files = await Multimedia.findAll({
    where: {
      userId: client.id,
      ...(type && { type }),
    },
  });

  res.json(files);
};

// DELETE client by ID
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await User.findByPk(id);

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    await client.destroy();

    res
      .status(200)
      .json({ success: true, message: "Cliente eliminado correctamente" });
  } catch (error) {
    console.error("❌ Error al eliminar cliente:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
