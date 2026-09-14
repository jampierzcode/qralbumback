// Verifica el tipo real de un archivo por sus primeros bytes (no confía en el MIME del navegador).
const fs = require("fs");

async function readHead(filePath, bytes = 64) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function ascii(buf, start, end) {
  return buf.subarray(start, end).toString("latin1");
}

// Devuelve "jpeg" | "png" | "gif" | "webp" | "heic" | "isobmff" | "webm" | "ogg" | "mp3" | "wav" | "aac" | null
function detect(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && ascii(buf, 1, 4) === "PNG") return "png";
  if (ascii(buf, 0, 3) === "GIF") return "gif";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "webp";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WAVE") return "wav";
  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
    return "isobmff"; // mp4, m4a, mov
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (ascii(buf, 0, 4) === "OggS") return "ogg";
  if (ascii(buf, 0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return "aac";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

const SIGNATURES_BY_KIND = {
  image: ["jpeg", "png", "gif", "webp", "heic"],
  video: ["isobmff", "webm"],
  audio: ["mp3", "aac", "isobmff", "ogg", "wav", "webm"],
};

async function detectFileSignature(filePath) {
  return detect(await readHead(filePath));
}

function signatureMatchesKind(signature, kind) {
  return Boolean(signature) && SIGNATURES_BY_KIND[kind].includes(signature);
}

module.exports = { detectFileSignature, signatureMatchesKind };
