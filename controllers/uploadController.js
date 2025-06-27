const { Multimedia, User } = require("../models");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

exports.uploadFile = async (req, res) => {
  const { type } = req.body; // photo, video, audio
  const client = await User.findOne({ where: { uuid: req.params.uuid } });
  if (!client) return res.status(404).json({ error: "Cliente no encontrado" });

  try {
    // Crear form-data para enviar archivos y carpeta a tu API
    const form = new FormData();
    form.append("folder", client.uuid); // carpeta con el UUID del cliente

    req.files.forEach((file) => {
      form.append("files[]", fs.createReadStream(file.path), file.originalname);
    });

    // Hacer la solicitud POST a tu API PHP
    const response = await axios.post(
      "https://apicursos.maicolbohorquez.com/index.php",
      form,
      {
        headers: {
          ...form.getHeaders(), // si tu API requiere token
        },
      }
    );

    const { success, files } = response.data;
    if (!success || !files || !Array.isArray(files)) {
      throw new Error("Respuesta inválida de la API de subida");
    }

    const savedFiles = [];

    for (const file of files) {
      const newFile = await Multimedia.create({
        type,
        url: file.url,
        name: file.original_name,
        userId: client.id,
      });
      savedFiles.push(newFile);
    }

    // Limpiar archivos temporales locales
    req.files.forEach((file) => {
      fs.unlink(file.path, (err) => {
        if (err) console.error("No se pudo eliminar el archivo temporal", err);
      });
    });

    res.json({ success: true, files: savedFiles });
  } catch (error) {
    console.error("Error al subir archivos:", error);
    res.status(500).json({ error: "Fallo al subir archivos a la API externa" });
  }
};
