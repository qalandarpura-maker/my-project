import fs from "fs";
import path from "path";
import crypto from "crypto";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function saveBuffer(buffer, ext = "") {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return { name, url: `/uploads/${name}` };
}

export function getFilePath(name) {
  return path.join(UPLOADS_DIR, name);
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

export function extForMime(mime) {
  const known = EXT_BY_MIME[mime?.toLowerCase()];
  if (known) return known;
  const type = mime?.split("/")[0] || "";
  return type === "image" ? ".jpg" : type === "video" ? ".mp4" : ".bin";
}