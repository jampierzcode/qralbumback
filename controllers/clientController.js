const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { Multimedia, User } = require("../models");
const { HttpError } = require("../middleware/errorHandler");

const CLIENT_ATTRIBUTES = ["id", "name", "email", "uuid", "createdAt", "updatedAt"];
const PUBLIC_FILE_ATTRIBUTES = ["id", "type", "url", "name"];
const FILE_TYPES = ["photo", "video", "audio"];

exports.getClientsWithMultimedia = async (req, res) => {
  const clients = await User.findAll({
    where: { role: "cliente" },
    attributes: CLIENT_ATTRIBUTES,
    include: [{ model: Multimedia, attributes: PUBLIC_FILE_ATTRIBUTES }],
  });
  res.json(clients);
};

exports.getClients = async (req, res) => {
  const clients = await User.findAll({
    where: { role: "cliente" },
    attributes: CLIENT_ATTRIBUTES,
  });
  res.json(clients);
};

exports.createClient = async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!name || !email) throw new HttpError(400, "Nombre y email son obligatorios.");

  if (await User.findOne({ where: { email } })) {
    throw new HttpError(409, "Ya existe un cliente con ese email.");
  }

  // Los clientes no inician sesión: si no se envía contraseña se genera una aleatoria.
  // Siempre se guarda hasheada.
  const rawPassword =
    typeof req.body?.password === "string" && req.body.password
      ? req.body.password
      : crypto.randomBytes(24).toString("base64url");

  const client = await User.create({
    name,
    email,
    uuid: uuidv4(),
    role: "cliente",
    password: await bcrypt.hash(rawPassword, 10),
  });

  res.status(201).json({ client });
};

exports.getFilesByType = async (req, res) => {
  const { uuid } = req.params;
  const { type } = req.query;
  if (type && !FILE_TYPES.includes(type)) throw new HttpError(400, "Tipo de archivo inválido.");

  const client = await User.findOne({ where: { uuid, role: "cliente" }, attributes: ["id"] });
  if (!client) throw new HttpError(404, "Álbum no encontrado.");

  const files = await Multimedia.findAll({
    where: { userId: client.id, ...(type && { type }) },
    attributes: PUBLIC_FILE_ATTRIBUTES,
    order: [["id", "ASC"]],
  });

  res.json(files);
};

exports.deleteClient = async (req, res) => {
  const client = await User.findOne({ where: { id: req.params.id, role: "cliente" } });
  if (!client) throw new HttpError(404, "Cliente no encontrado.");

  await client.destroy();
  res.json({ success: true, message: "Cliente eliminado correctamente" });
};
