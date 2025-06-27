const express = require("express");
const cors = require("cors");
const { sequelize } = require("./models"); // Importa desde models/index.js

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Rutas
app.use("/api/auth", require("./routes/auth"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/upload", require("./routes/upload"));

// Sync DB y arrancar servidor
sequelize.sync().then(() => {
  app.listen(3001, () =>
    console.log("🚀 Server running on http://localhost:3001")
  );
});
