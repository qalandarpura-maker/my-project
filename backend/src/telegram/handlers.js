import { Bot, InputFile } from "grammy";
import prisma from "../lib/prisma.js";
import { decryptToken } from "../lib/crypto.js";
import { emitAgent, emitStaff } from "../lib/socket.js";
import { saveUpload, extForMime, isAllowedMime } from "../lib/uploads.js";

const runningBots = new Map(); // botId -> grammY instance
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 20 * 1024 * 1024); // default 20MB

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
    unreadCount: 0,
  };
}

async function upsertCustomer(ctx, botRecord, isInboundMessage = false) {
  const info = getCustomerInfo(ctx);
  const existing = await prisma.customer.findUnique({
    where: { telegramId_botId: { telegramId: BigInt(info.id), botId: botRecord.id } },
  });

  const wasClosed = existing?.status === "closed";

  return prisma.customer.upsert({
    where: { telegramId_botId: { telegramId: BigInt(info.id), botId: botRecord.id } },
    create: { ...customerData(info, botRecord), unreadCount: isInboundMessage ? 1 : 0 },
    update: {
      firstName: info.first_name,
      lastName: info.last_name,
      telegramUser: info.username,
      lastMessageAt: new Date(),
      ...(wasClosed && { status: "unassigned", assignedAgentId: null }),
      ...(isInboundMessage && { unreadCount: { increment: 1 } }),
    },
  });
}

function customerSummary(customer, botRecord) {
  return {
    ...customer,
    telegramId: customer.telegramId.toString(),
    botUsername: botRecord?.botUsername,
  };
}

async function broadcastIncoming(customer, message, botRecord) {
  const summaryCustomer = customerSummary(
    await prisma.customer.findUnique({
      where: { id: customer.id },
      include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
    }),
    botRecord
  );

  const payload = {
    customerId: customer.id,
    customer: summaryCustomer,
    messages: [message],
  };

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:update", payload);
  }
  emitStaff("chat:new", payload);
}

async function downloadTelegramFile(bot, fileId) {
  const info = await bot.api.getFile(fileId);
  if (!info.file_path) throw new Error("File ka path nahi mila");
  if (info.file_size && info.file_size > MAX_FILE_SIZE) {
    throw new Error(`File bahut bada hai (max ${MAX_FILE_SIZE / 1024 / 1024}MB allowed)`);
  }

  const rawUrl = `https://api.telegram.org/file/bot${bot.token}/${info.file_path}`;
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`Download fail: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const ext = "." + (info.file_path.split(".").pop() || "jpg");
  const mime = info.mime_type || (ext === ".jpg" ? "image/jpeg" : "application/octet-stream");
  if (!isAllowedMime(mime)) {
    throw new Error(`File type allowed nahi hai: ${mime}`);
  }

  return saveUpload(buf, `telegram-${fileId}`, mime);
}

export function registerHandlers(bot, botRecord) {
  bot.command("start", async (ctx) => {
    try {
      await upsertCustomer(ctx, botRecord, false);
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
      const customer = await upsertCustomer(ctx, botRecord, true);
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
    const telegramMessageId = ctx.message.message_id;
    try {
      const customer = await upsertCustomer(ctx, botRecord, true);
      const { url } = await downloadTelegramFile(bot, fileId);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text: caption,
          mediaType: "image",
          mediaUrl: url,
          telegramMessageId,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("photo handler error:", e.message);
    }
  });

  bot.on(":video", async (ctx) => {
    const video = ctx.message.video;
    const fileId = video.file_id;
    const caption = ctx.message.caption || "";
    const telegramMessageId = ctx.message.message_id;
    try {
      const customer = await upsertCustomer(ctx, botRecord, true);
      const { url } = await downloadTelegramFile(bot, fileId);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text: caption,
          mediaType: "video",
          mediaUrl: url,
          telegramMessageId,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("video handler error:", e.message);
    }
  });

  bot.on(":animation", async (ctx) => {
    const anim = ctx.message.animation;
    const fileId = anim.file_id;
    const caption = ctx.message.caption || "";
    const telegramMessageId = ctx.message.message_id;
    try {
      const customer = await upsertCustomer(ctx, botRecord, true);
      const { url } = await downloadTelegramFile(bot, fileId);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text: caption,
          mediaType: "video",
          mediaUrl: url,
          telegramMessageId,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("animation handler error:", e.message);
    }
  });

  bot.on(":document", async (ctx) => {
    const doc = ctx.message.document;
    const caption = ctx.message.caption || "";
    const telegramMessageId = ctx.message.message_id;
    try {
      const customer = await upsertCustomer(ctx, botRecord, true);
      const { url } = await downloadTelegramFile(bot, doc.file_id);
      const message = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "customer",
          text: caption,
          mediaType:
            doc.mime_type && doc.mime_type.startsWith("video/")
              ? "video"
              : doc.mime_type && doc.mime_type.startsWith("image/")
                ? "image"
                : "document",
          mediaUrl: url,
          telegramMessageId,
        },
      });
      await broadcastIncoming(customer, message, botRecord);
    } catch (e) {
      console.error("document handler error:", e.message);
    }
  });
}

async function markBotStatus(botId, status) {
  try {
    await prisma.bot.update({ where: { id: botId }, data: { status } });
  } catch (e) {
    console.error(`[bot] status update fail ${botId}:`, e.message);
  }
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
    await markBotStatus(botRecord.id, "inactive");
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

  return await bot.api.sendMessage(telegramId.toString(), text);
}

export async function sendMediaToCustomer(
  botRecord,
  telegramId,
  filePath,
  fileName,
  caption,
  isImage,
  isVideo
) {
  const bot = runningBots.get(botRecord.id);
  if (!bot) throw new Error("Bot active nahi hai");

  const chatId = telegramId.toString();

  if (isVideo) {
    try {
      return await bot.api.sendVideo(
        chatId,
        new InputFile(filePath, fileName),
        {
          caption: caption || undefined,
        }
      );
    } catch (e) {
      console.error(
        "[bot] sendVideo failed, trying document:",
        e.message
      );

      return await bot.api.sendDocument(
        chatId,
        new InputFile(filePath, fileName),
        {
          caption: caption || undefined,
        }
      );
    }
  }

  if (isImage) {
    try {
      return await bot.api.sendPhoto(
        chatId,
        new InputFile(filePath, fileName),
        {
          caption: caption || undefined,
        }
      );
    } catch (e) {
      console.error(
        "[bot] sendPhoto failed, trying document:",
        e.message
      );

      return await bot.api.sendDocument(
        chatId,
        new InputFile(filePath, fileName),
        {
          caption: caption || undefined,
        }
      );
    }
  }

  return await bot.api.sendDocument(
    chatId,
    new InputFile(filePath, fileName),
    {
      caption: caption || undefined,
    }
  );
}
export async function deleteTelegramMessage(botRecord, telegramId, messageId) {
  const bot = runningBots.get(botRecord.id);
  if (!bot) throw new Error("Bot active nahi hai");

  return await bot.api.deleteMessage(
    telegramId.toString(),
    Number(messageId)
  );
}
export function isBotRunning(botId) {
  return runningBots.has(botId);
}