import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.OWNER_USERNAME || "boss";
  const password = process.env.OWNER_PASSWORD || "owner123";
  const name = process.env.OWNER_NAME || "Owner";

  const existing = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (existing) {
    console.log("Owner pehle se maujood hai, seed skip.");
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const owner = await prisma.user.create({
    data: { name, username, passwordHash: hash, role: "OWNER" },
  });
  console.log(`Owner ban gaya -> username: ${username} / password: ${password}`);
  console.log(`Login pe apna role check karo: ${owner.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());