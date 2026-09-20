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
      blocked: false, // dobara message bhej raha hai => unblock ho chuka hai
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

const PHOTO_API_URL = "https://api.telegram.org/file/bot";
const PHOTO_RETRY_MS = 24 * 60 * 60 * 1000; // 24 ghante baad dobara check

async function refreshCustomerPhoto(bot, customer, force = false) {
  const photo = customer.photo;
  const lastCheckedAt = customer.photoCheckedAt;
  const stale =
    !lastCheckedAt || Date.now() - new Date(lastCheckedAt).getTime() > PHOTO_RETRY_MS;

  // Pehle se photo hai aur check purana nahi to skip
  if (!force && photo && !stale) return photo;
  // No-photo marker ("") hai aur check purana nahi to denn ke liye dobara fetch na karo
  if (!force && photo === "" && !stale) return null;

  try {
    const res = await bot.api.getUserProfilePhotos(customer.telegramId.toString(), { limit: 1 });
    const photos = res?.photos;
    if (!photos?.length) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { photo: "", photoCheckedAt: new Date() },
      });
      return null;
    }

    const photoSize = photos[0][photos[0].length - 1];
    const info = await bot.api.getFile(photoSize.file_id);
    if (!info?.file_path) return null;

    const rawUrl = `${PHOTO_API_URL}${bot.token}/${info.file_path}`;
    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error(`download fail: ${resp.status}`);

    const buf = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get("content-type") || "image/jpeg";
    const { url } = await saveUpload(buf, `profile-${customer.telegramId}`, mime);

    await prisma.customer.update({
      where: { id: customer.id },
      data: { photo: url, photoCheckedAt: new Date() },
    });
    console.log(`[photo] saved customer ${customer.telegramId} ->`, url);
    return url;
  } catch (e) {
    console.error(`[photo] fetch fail (${customer.telegramId}):`, e.message);
    return null;
  }
}

const BACKFILL_CONCURRENCY = 5;

async function mapLimit(items, limit, fn) {
  let index = 0;
  const results = new Array(items.length);
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runPhotoBackfill() {
  try {
    const staleCutoff = new Date(Date.now() - PHOTO_RETRY_MS);
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { photo: null },
          { photo: "", photoCheckedAt: null },
          { photo: "", photoCheckedAt: { lt: staleCutoff } },
        ],
      },
      take: 300,
    });
    if (!customers.length) {
      console.log("[photo] backfill: koi pending photo nahi");
      return;
    }

    const working = customers.filter((c) => runningBots.has(c.botId));
    if (!working.length) {
      console.log("[photo] backfill: running bot nahi mila, skip");
      return;
    }

    console.log(`[photo] backfill: ${working.length}/${customers.length} customers ke liye try kar rahe hain`);

    const results = await mapLimit(working, BACKFILL_CONCURRENCY, async (c) => {
      const bot = runningBots.get(c.botId);
      if (!bot) return null;
      return refreshCustomerPhoto(bot, c, false);
    });

    const saved = results.filter(Boolean).length;
    console.log(`[photo] backfill complete: ${saved} photo(s) saved`);
  } catch (e) {
    console.error("[photo] backfill error:", e.message);
  }
}

export function startPhotoBackfill() {
  // Bots ready hone ka intezar
  setTimeout(() => runPhotoBackfill(), 5000);
  const timer = setInterval(runPhotoBackfill, 60 * 60 * 1000);
  timer.unref?.();
  return timer;
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

const EXT_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

function mimeForExt(ext) {
  return EXT_MIME[(ext || "").toLowerCase()] || null;
}

async function downloadTelegramFile(bot, fileId, mimeHint) {
  const info = await bot.api.getFile(fileId);
  if (!info.file_path) throw new Error("File ka path nahi mila");
  if (info.file_size && info.file_size > MAX_FILE_SIZE) {
    throw new Error(`File bahut bada hai (max ${MAX_FILE_SIZE / 1024 / 1024}MB allowed)`);
  }

  const rawUrl = `https://api.telegram.org/file/bot${bot.token}/${info.file_path}`;
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`Download fail: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Telegram getFile response me mime_type nahi aata. Pehle message-object ka
  // mimeHint try karo (video.mime_type etc.), phir extension detection, phir fallback.
  const ext = "." + (info.file_path.split(".").pop() || "jpg");
  const mime = mimeHint || mimeForExt(ext) || info.mime_type || "application/octet-stream";
  if (!isAllowedMime(mime)) {
    throw new Error(`File type allowed nahi hai: ${mime}`);
  }

  return saveUpload(buf, `telegram-${fileId}`, mime);
}

export function registerHandlers(bot, botRecord) {
  bot.command("start", async (ctx) => {
    try {
      const customer = await upsertCustomer(ctx, botRecord, false);
      await refreshCustomerPhoto(bot, customer, true);
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
      await refreshCustomerPhoto(bot, customer);
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
      await refreshCustomerPhoto(bot, customer);
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
      await refreshCustomerPhoto(bot, customer);
      const { url } = await downloadTelegramFile(bot, fileId, video.mime_type);
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
      await refreshCustomerPhoto(bot, customer);
      const { url } = await downloadTelegramFile(bot, fileId, anim.mime_type);
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
      await refreshCustomerPhoto(bot, customer);
      const { url } = await downloadTelegramFile(bot, doc.file_id, doc.mime_type);
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