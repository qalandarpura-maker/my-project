import prisma from "../lib/prisma.js";
import { isR2Configured } from "../lib/r2.js";

export async function diagnostics(req, res) {
  const r2Endpoint = Boolean(process.env.R2_ENDPOINT);
  const r2Credentials = Boolean(
    process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  );
  const r2Bucket = Boolean(process.env.R2_BUCKET_NAME);
  const r2Public = Boolean(process.env.R2_PUBLIC_URL);

  const stats = await prisma.message.aggregate({
    where: { mediaUrl: { not: null } },
    _count: { id: true },
  });

  const recentMedia = await prisma.message.findMany({
    where: { mediaUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { mediaUrl: true, mediaType: true, createdAt: true },
  });

  res.json({
    r2: {
      configured: isR2Configured,
      endpointSet: r2Endpoint,
      credentialsSet: r2Credentials,
      bucketSet: r2Bucket,
      publicUrlSet: r2Public,
      publicUrl: process.env.R2_PUBLIC_URL || null,
      endpoint: process.env.R2_ENDPOINT || null,
      bucket: process.env.R2_BUCKET_NAME || null,
    },
    storageMode: isR2Configured ? "r2" : "local",
    totalMediaMessages: stats._count.id,
    recentMedia,
  });
}