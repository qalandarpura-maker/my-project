import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import "dotenv/config";

const prisma = new PrismaClient();

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function main() {
  const username = requireEnv("OWNER_USERNAME");
  const password = requireEnv("OWNER_PASSWORD");
  const name = requireEnv("OWNER_NAME");

  const existing = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (existing) {
    console.log("Owner pehle se maujood hai, seed skip.");
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const owner = await prisma.user.create({
    data: { name, username, passwordHash: hash, role: "OWNER" },
  });
  console.log(`Owner account ban gaya -> username: ${username} / role: ${owner.role}`);
  console.log("Security ke liye OWNER_PASSWORD .env me zaroor change karo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());