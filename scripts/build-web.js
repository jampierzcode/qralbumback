// Build de producción (Railway, VPS…): descarga qralbumfront y lo compila dentro de ./web.
// El backend necesita del frontend las plantillas (manifest + schema), gift-core y el build (dist).
// En local no hace falta: se usa la carpeta hermana ../qralbumfront.
//
// Variables:
//   WEB_REPO   repositorio de GitHub (por defecto jampierzcode/qralbumfront)
//   WEB_REF    rama, tag o commit (por defecto main)
//   GITHUB_TOKEN  sólo si el repositorio es privado
//   VITE_*     se pasan al build del frontend
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");
const repo = process.env.WEB_REPO || "jampierzcode/qralbumfront";
const ref = process.env.WEB_REF || "main";
const token = process.env.GITHUB_TOKEN;

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
}

async function download() {
  // Sin token: codeload (sin límite de la API). Con token: API (repos privados).
  const url =
    process.env.WEB_TARBALL_URL ||
    (token ? `https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(ref)}` : `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref)}`);
  console.log(`⬇️  Descargando ${process.env.WEB_TARBALL_URL ? url : `${repo}@${ref}`}`);
  const headers = { "User-Agent": "qralbum-build", Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`No se pudo descargar el frontend (${res.status}). ¿Repositorio privado? Define GITHUB_TOKEN.`);
  const file = path.join(ROOT, ".web.tar.gz");
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function main() {
  const tarball = await download();
  fs.rmSync(WEB_DIR, { recursive: true, force: true });
  fs.mkdirSync(WEB_DIR, { recursive: true });
  run("tar", ["-xzf", tarball, "--strip-components=1", "-C", WEB_DIR], ROOT);
  fs.rmSync(tarball);

  for (const required of ["gift-core/index.js", "src/templates", "package.json"]) {
    if (!fs.existsSync(path.join(WEB_DIR, required))) throw new Error(`El frontend descargado no tiene ${required}. ¿WEB_REF correcto?`);
  }

  console.log("📦 Instalando dependencias del frontend");
  run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], WEB_DIR);
  console.log("🏗️  Compilando frontend");
  run("npm", ["run", "build"], WEB_DIR);
  // En ejecución sólo se usan dist/, src/templates y gift-core (sin dependencias).
  fs.rmSync(path.join(WEB_DIR, "node_modules"), { recursive: true, force: true });
  console.log("✅ Frontend listo en ./web");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
