import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

export const isR2Configured = Boolean(endpoint && accessKeyId && secretAccessKey && bucket);

if (isR2Configured) {
  if (!process.env.R2_PUBLIC_URL) {
    console.warn("[r2] R2 configured hai lekin R2_PUBLIC_URL set nahi — public access fail ho sakta hai");
  }
  console.log("[r2] Cloudflare R2 storage enabled");
} else {
  console.warn(
    "[r2] R2 NOT configured (endpoint/accessKey/secret/bucket ki zaroorat hai) — uploads local disk pe honge. Render pe local disk ephemeral hai."
  );
}

let client = null;

export function getR2Client() {
  if (!isR2Configured) return null;
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export function getR2PublicUrl(key) {
  if (process.env.R2_PUBLIC_URL) {
    const base = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
    return `${base}/${key}`;
  }
  const ep = endpoint.replace(/\/$/, "");
  return `${ep}/${bucket}/${key}`;
}

export async function uploadToR2(key, buffer, contentType) {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 is not configured");

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );

  return getR2PublicUrl(key);
}

export async function deleteFromR2(key) {
  const s3 = getR2Client();
  if (!s3) return false;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    console.error("R2 delete failed:", e.message);
    return false;
  }
}
