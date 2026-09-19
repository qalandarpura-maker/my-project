import crypto from "crypto";

const KEY = process.env.BOT_TOKEN_SECRET;

if (!KEY) {
  throw new Error("Missing required environment variable: BOT_TOKEN_SECRET");
}
if (KEY.length !== 32) {
  console.warn("BOT_TOKEN_SECRET should be exactly 32 characters for best security.");
}

function getKey() {
  return crypto.createHash("sha256").update(KEY).digest();
}

const ALGO = "aes-256-cbc";

export function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(enc) {
  const [ivHex, dataHex] = enc.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}