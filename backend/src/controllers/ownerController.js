import { Bot } from "grammy";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { encryptToken, decryptToken } from "../lib/crypto.js";
import { emitUser } from "../lib/socket.js";
import { startBot, stopBot } from "../telegram/handlers.js";

// ---------- Bots (owner) ----------

export async function addBot(req, res) {
  const { botToken } = req.body || {};
  if (!botToken) return res.status(400).json({ error: "Bot token required" });

  let me;
  try {
    const bot = new Bot(botToken.trim());
    me = await bot.api.getMe();
  } catch (e) {
    return res.status(400).json({ error: "Invalid bot token (BotFather se check karo)" });
  }

  const existing = await prisma.bot.findUnique({ where: { botUsername: me.username } });
  if (existing) return res.status(400).json({ error: "Ye bot pehle se add hai" });

  const record = await prisma.bot.create({
    data: {
      ownerId: req.user.id,
      botTokenEnc: encryptToken(botToken.trim()),
      botUsername: me.username,
      botName: me.first_name || me.username,
      status: "active",
    },
  });

  try {
    await startBot(record);
  } catch (e) {
    await prisma.bot.update({ where: { id: record.id }, data: { status: "inactive" } });
    return res.status(400).json({ error: "Bot token verify hua, lekin start nahi ho paya" });
  }

  emitUser(req.user.id, "bots:update", null);
  res.json({ bot: { id: record.id, botUsername: me.username, botName: me.first_name || me.username } });
}

export async function listBots(req, res) {
  const bots = await prisma.bot.findMany({
    where: { ownerId: req.user.id },
    include: { _count: { select: { customers: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    bots: bots.map((b) => ({
      id: b.id,
      botUsername: b.botUsername,
      botName: b.botName,
      greeting: b.greeting,
      status: b.status,
      customers: b._count.customers,
      createdAt: b.createdAt,
    })),
  });
}

export async function removeBot(req, res) {
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
  if (!bot) return res.status(404).json({ error: "Bot nahi mila" });

  await stopBot(bot.id);
  await prisma.customer.deleteMany({ where: { botId: bot.id } });
  await prisma.bot.delete({ where: { id: bot.id } });

  emitUser(req.user.id, "bots:update", null);
  res.json({ ok: true });
}

export async function toggleBot(req, res) {
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
  if (!bot) return res.status(404).json({ error: "Bot nahi mila" });

  if (bot.status === "active") {
    await stopBot(bot.id);
    await prisma.bot.update({ where: { id: bot.id }, data: { status: "inactive" } });
  } else {
    await startBot(bot);
    await prisma.bot.update({ where: { id: bot.id }, data: { status: "active" } });
  }

  emitUser(req.user.id, "bots:update", null);
  res.json({ ok: true, status: bot.status === "active" ? "inactive" : "active" });
}

export async function updateBotGreeting(req, res) {
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
  if (!bot) return res.status(404).json({ error: "Bot nahi mila" });

  const { greeting } = req.body || {};
  await prisma.bot.update({
    where: { id: bot.id },
    data: { greeting: typeof greeting === "string" ? greeting : "" },
  });

  emitUser(req.user.id, "bots:update", null);
  res.json({ ok: true });
}

// ---------- Admin/Agent management ----------

async function createUser(req, res, role) {
  const { name, username, password } = req.body || {};
  if (!name || !username || password?.length < 4) {
    return res.status(400).json({ error: "name, username aur password (min 4 chars) required" });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(400).json({ error: "Username pehle se hai" });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      username,
      passwordHash: hash,
      role,
      createdById: req.user.id,
    },
  });

  res.json({
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
}

export function createAdmin(req, res) {
  return createUser(req, res, "ADMIN");
}

export function createAgent(req, res) {
  return createUser(req, res, "AGENT");
}

export async function listByRole(req, res, role) {
  const users = await prisma.user.findMany({
    where: { role, active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, username: true, role: true, createdAt: true },
  });
  res.json({ users });
}

export async function listAdmins(req, res) {
  return listByRole(req, res, "ADMIN");
}

export async function listAgents(req, res) {
  return listByRole(req, res, "AGENT");
}

export async function removeUser(req, res, role) {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, role },
    include: { assignedChats: true },
  });
  if (!user) return res.status(404).json({ error: "User nahi mila" });

  await prisma.customer.updateMany({
    where: { assignedAgentId: user.id },
    data: { assignedAgentId: null, status: "unassigned" },
  });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { active: false },
  });
  res.json({ ok: true, id: updated.id });
}