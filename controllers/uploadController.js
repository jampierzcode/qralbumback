const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { Multimedia, User } = require("../models");
const { HttpError } = require("../middleware/errorHandler");
const { cleanupTempFiles, kindOfMime } = require("../middleware/upload");
const { legacyMediaApiUrl } = require("../config/config");

const TYPE_TO_KIND = { photo: "image", video: "video", audio: "audio" };
const EXTERNAL_TIMEOUT_MS = 120 * 1000;

exports.uploadFile = async (req, res) => {
  try {
    const { type } = req.body;
    if (!TYPE_TO_KIND[type]) throw new HttpError(400, "Tipo de archivo inválido.");
    if (!req.files?.length) throw new HttpError(400, "Selecciona al menos un archivo.");

    const wrongKind = req.files.find((f) => kindOfMime(f.mimetype) !== TYPE_TO_KIND[type]);
    if (wrongKind) {
      throw new HttpError(415, `"${wrongKind.originalname}" no corresponde al tipo seleccionado.`);
    }

    const client = await User.findOne({ where: { uuid: req.params.uuid, role: "cliente" } });
    if (!client) throw new HttpError(404, "Cliente no encontrado.");

    const form = new FormData();
    form.append("folder", client.uuid);
    req.files.forEach((file) => {
      form.append("files[]", fs.createReadStream(file.path), file.originalname);
    });

    let response;
    try {
      response = await axios.post(legacyMediaApiUrl, form, {
        headers: form.getHeaders(),
        timeout: EXTERNAL_TIMEOUT_MS,
        maxBodyLength: Infinity,
      });
    } catch (err) {
      throw new HttpError(502, "No se pudo subir al servidor de archivos. Intenta nuevamente.");
    }

    const { success, files } = response.data || {};
    if (!success || !Array.isArray(files)) {
      throw new HttpError(502, "El servidor de archivos respondió de forma inesperada.");
    }

    const savedFiles = [];
    for (const file of files) {
      savedFiles.push(
        await Multimedia.create({
          type,
          url: file.url,
          name: file.original_name,
          userId: client.id,
        })
      );
    }

    res.json({ success: true, files: savedFiles });
  } finally {
    // Antes sólo se borraban en éxito y quedaban expuestos en /uploads.
    await cleanupTempFiles(req);
  }
};

exports.deleteFile = async (req, res) => {
  const file = await Multimedia.findByPk(req.params.id);
  if (!file) throw new HttpError(404, "Archivo no encontrado.");

  let response;
  try {
    response = await axios.delete(legacyMediaApiUrl, {
      data: { urls: [file.url] },
      headers: { "Content-Type": "application/json" },
      timeout: EXTERNAL_TIMEOUT_MS,
    });
  } catch {
    throw new HttpError(502, "No se pudo eliminar en el servidor de archivos.");
  }
  if (!response.data?.success) {
    throw new HttpError(502, "El servidor de archivos no confirmó la eliminación.");
  }

  await file.destroy();
  res.json({ success: true, deleted: file.url });
};
