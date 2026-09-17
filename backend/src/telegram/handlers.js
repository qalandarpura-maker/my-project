import { Bot, InputFile } from "grammy";
import prisma from "../lib/prisma.js";
import { decryptToken } from "../lib/crypto.js";
import { emitAgent, emitStaff } from "../lib/socket.js";
import { saveBuffer, extForMime } from "../lib/uploads.js";

const runningBots = new Map(); // botId -> grammY instance

function getCustomerInfo(ctx) {
  const { id, first_name, last_name, username } = ctx.from || {};
  return { id, first_name, last_name, username };
}

function customerData(info, botRecord) {
  return {
    telegramId: BigInt(info.id),
    botId: botRecord.id,
    firstName: info.first_name,
    lastName: info.last_name,
    telegramUser: info.username,
    lastMessageAt: new Date(),
  };
}

async function upsertCustomer(ctx, botRecord) {
  const info = getCustomerInfo(ctx);
  return prisma.customer.upsert({
    where: { telegramId_botId: { telegramId: BigInt(info.id), botId: botRecord.id } },
    create: customerData(info, botRecord),
    update: {
      firstName: info.first_name,
      lastName: info.last_name,
      telegramUser: info.username,
      lastMessageAt: new Date(),
    },
  });
}

async function broadcastIncoming(customer, message, botRecord) {
  const fresh = await prisma.message.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "asc" },
  });

  const summaryCustomer = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:update", {
      customerId: customer.id,
      customer: summaryCustomer,
      messages: [message],
    });
  }
  emitStaff("chat:new", {
    customer: summaryCustomer,
    messages: fresh,
    botUsername: botRecord.botUsername,
  });
}

async function downloadTelegramFile(bot, fileId) {
  const info = await bot.api.getFile(fileId);
  if (!info.file_path) throw new Error("File ka path nahi mila");
  const rawUrl = `https://api.telegram.org/file/bot${bot.token}/${info.file_path}`;
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`Download fail: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = "." + (info.file_path.split(".").pop() || "jpg");
  return saveBuffer(buf, ext);
}

export function registerHandlers(bot, botRecord) {
  bot.command("start", async (ctx) => {
    try {
      await upsertCustomer(ctx, botRecord);
      const fresh = await prisma.bot.findUnique({ where: { id: botRecord.id } });
      const greeting =
        (fresh?.greeting || "").trim() ||
        "👋 Assalam o Alaikum! Aap ka message hamari support team ko mil gaya hai. Jald hi iska jawab milega.";
      if (greeting) await ctx.reply(greeting);
    } catch (e) {
      console.error("start handler error:", e.message);
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const telegramMessageId = ctx.message.message_id;
    try {
      const customer = await upsertCustomer(ctx, botRecord);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text,
          telegramMessageId,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("message handler error:", e.message);
    }
  });

  bot.on(":photo", async (ctx) => {
    const photo = ctx.message.photo;
    const fileId = photo[photo.length - 1].file_id;
    const caption = ctx.message.caption || "";
    try {
      const customer = await upsertCustomer(ctx, botRecord);
      const { url } = await downloadTelegramFile(bot, fileId);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text: caption,
          mediaType: "image",
          mediaUrl: url,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("photo handler error:", e.message);
    }
  });

  bot.on(":document", async (ctx) => {
    const doc = ctx.message.document;
    const caption = ctx.message.caption || "";
    try {
      const customer = await upsertCustomer(ctx, botRecord);
      const { url } = await downloadTelegramFile(bot, doc.file_id);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text: caption,
          mediaType: doc.mime_type && doc.mime_type.startsWith("image/") ? "image" : "document",
          mediaUrl: url,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("document handler error:", e.message);
    }
  });
}

export async function startBot(botRecord) {
  if (runningBots.has(botRecord.id)) return runningBots.get(botRecord.id);
  try {
    const token = decryptToken(botRecord.botTokenEnc);
    const bot = new Bot(token);
    registerHandlers(bot, botRecord);
    await bot.init();
    bot.start({
      onStart: (me) => {
        console.log(`[bot] start hogaya: @${me.username}`);
      },
    });
    runningBots.set(botRecord.id, bot);
    return bot;
  } catch (e) {
    console.error(`[bot] start fail (${botRecord.botUsername}):`, e.message);
    throw e;
  }
}

export async function startAllBots() {
  const bots = await prisma.bot.findMany({ where: { status: "active" } });
  for (const b of bots) {
    // Async fire-and-forget: server startup ko block na kare
    startBot(b).catch((e) => console.error(`[bot] skip ${b.botUsername}:`, e.message));
  }
  console.log(`[bots] ${bots.length} bot(s) start kar rahe hain (background me)`);
}

export async function stopBot(botId) {
  const bot = runningBots.get(botId);
  if (bot) {
    await bot.stop();
    runningBots.delete(botId);
  }
}

export function getRunningBot(botId) {
  return runningBots.get(botId);
}

export async function sendToCustomer(botRecord, telegramId, text) {
  const bot = runningBots.get(botRecord.id);
  if (!bot) throw new Error("Bot active nahi hai");
  return bot.api.sendMessage(telegramId.toString(), text);
}

export async function deleteTelegramMessage(botRecord, telegramId, messageId) {
  const bot = runningBots.get(botRecord.id);
  if (!bot) return;
  try {
    await bot.api.deleteMessage(telegramId.toString(), messageId);
  } catch (e) {
    console.error("[bot] telegram delete fail:", e.message);
  }
}

export async function sendMediaToCustomer(botRecord, telegramId, filePath, fileName, caption, isImage) {
  const bot = runningBots.get(botRecord.id);
  if (!bot) throw new Error("Bot active nahi hai");

  if (isImage) {
    return bot.api.sendPhoto(telegramId.toString(), new InputFile(filePath, fileName), {
      caption: caption || undefined,
    });
  } else {
    return bot.api.sendDocument(telegramId.toString(), new InputFile(filePath, fileName), {
      caption: caption || undefined,
    });
  }
}

export function isBotRunning(botId) {
  return runningBots.has(botId);
}