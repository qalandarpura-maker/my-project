import fs from "fs";
import path from "path";
import crypto from "crypto";
import { isR2Configured, uploadToR2, deleteFromR2 } from "./r2.js";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/3gpp",
  "video/3gpp2",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/mpeg",
];

export function isAllowedMime(mime) {
  if (!mime) return false;
  const lower = mime.toLowerCase();
  if (ALLOWED_MIME_TYPES.includes(lower)) return true;
  // image/* aur video/* allow karna ho to neeche extend karein
  return lower.startsWith("image/") || lower.startsWith("video/");
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "video/3gpp": ".3gp",
  "video/3gpp2": ".3g2",
  "video/x-msvideo": ".avi",
  "video/x-ms-wmv": ".wmv",
  "video/mpeg": ".mpg",
};

export function extForMime(mime) {
  const known = EXT_BY_MIME[mime?.toLowerCase()];
  if (known) return known;
  const type = mime?.split("/")[0] || "";
  return type === "image" ? ".jpg" : ".bin";
}

export function fileFilter(req, file, cb) {
  if (isAllowedMime(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
}

function generateKey(originalName, ext) {
  const base = originalName ? path.parse(originalName).name.replace(/[^a-z0-9]/gi, "-").slice(0, 30) : "file";
  const rand = crypto.randomBytes(8).toString("hex");
  return `${Date.now()}-${base}-${rand}${ext}`;
}

export async function saveUpload(buffer, originalName, mimeType) {
  const ext = extForMime(mimeType);
  const key = generateKey(originalName, ext);

  if (isR2Configured) {
    const publicUrl = await uploadToR2(key, buffer, mimeType);
    return { key, url: publicUrl, storage: "r2" };
  }

  // Local fallback
  ensureUploadsDir();
  const filePath = path.join(UPLOADS_DIR, key);
  fs.writeFileSync(filePath, buffer);
  return { key, url: `/uploads/${key}`, storage: "local" };
}

export async function deleteUpload(url) {
  if (!url) return false;

  if (isR2Configured && !url.startsWith("/uploads/")) {
    // R2 public URL se key extract karna tricky hai, lekin custom public URL ke case me
    // key nikaalne ka safe tareeqa: path segment after bucket/ base
    const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (publicBase && url.startsWith(publicBase)) {
      const key = url.slice(publicBase.length + 1);
      return deleteFromR2(key);
    }
    // Fallback: endpoint-based URL
    const ep = process.env.R2_ENDPOINT.replace(/\/$/, "");
    const bucket = process.env.R2_BUCKET_NAME;
    const prefix = `${ep}/${bucket}/`;
    if (url.startsWith(prefix)) {
      const key = url.slice(prefix.length);
      return deleteFromR2(key);
    }
    return false;
  }

  // Local delete
  if (url.startsWith("/uploads/")) {
    const name = path.basename(url);
    const filePath = path.join(UPLOADS_DIR, name);
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      console.error("Local file delete failed:", e.message);
      return false;
    }
  }

  return false;
}

export function getLocalFilePath(name) {
  return path.join(UPLOADS_DIR, name);
}
