import fs from "fs";
import prisma from "../lib/prisma.js";
import { sendToCustomer, sendMediaToCustomer, deleteTelegramMessage } from "../telegram/handlers.js";
import { emitAgent, emitStaff } from "../lib/socket.js";
import { saveUpload, extForMime, deleteUpload, getLocalFilePath } from "../lib/uploads.js";

async function customerSummary(customer) {
  const lastMsg = await prisma.message.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  let lastMessage = lastMsg?.text || null;
  if (!lastMessage && lastMsg?.mediaType) lastMessage = lastMsg.mediaType === "image" ? "(image)" : "(document)";
  if (!lastMessage && lastMsg?.sender === "note") lastMessage = "note";
  return {
    id: customer.id,
    telegramId: customer.telegramId.toString(),
    firstName: customer.firstName,
    lastName: customer.lastName,
    telegramUser: customer.telegramUser,
    botUsername: customer.bot?.botUsername,
    botName: customer.bot?.botName,
    status: customer.status,
    agentId: customer.assignedAgentId,
    agentName: customer.assignedAgent?.name,
    lastMessageAt: customer.lastMessageAt,
    lastMessage,
    lastSender: lastMsg?.sender || null,
    unreadCount: customer.unreadCount || 0,
  };
}

async function getUploadBuffer(url) {
  if (!url) return null;
  if (url.startsWith("/uploads/")) {
    const name = url.split("/").pop();
    return fs.readFileSync(getLocalFilePath(name));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Media fetch fail: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function buildWhere(req) {
  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (isStaff) return {};
  return { assignedAgentId: req.user.id, status: { not: "closed" } };
}

export async function listCustomers(req, res) {
  const customers = await prisma.customer.findMany({
    where: buildWhere(req),
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
    orderBy: { lastMessageAt: "desc" },
  });

  const list = [];
  for (const c of customers) list.push(await customerSummary(c));
  res.json({ customers: list });
}

export async function getUnreadCount(req, res) {
  const result = await prisma.customer.aggregate({
    where: buildWhere(req),
    _sum: { unreadCount: true },
  });
  res.json({ count: result._sum.unreadCount || 0 });
}

export async function getConversation(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (!isStaff && customer.assignedAgentId !== req.user.id) {
    return res.status(403).json({ error: "Yeh aapki assigned conversation nahi hai" });
  }

  const messages = await prisma.message.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    customer: await customerSummary(customer),
    messages,
  });
}

export async function markAsRead(req, res) {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (!isStaff && customer.assignedAgentId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: { unreadCount: 0 },
  });

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });
  const summary = await customerSummary(updated);

  emitStaff("chat:updated", { customer: summary });
  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:updated", { customer: summary });
  }

  res.json({ ok: true, customer: summary });
}

export async function assign(req, res) {
  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (!isStaff) return res.status(403).json({ error: "Forbidden" });

  const { agentId, note } = req.body || {};
  if (!agentId) return res.status(400).json({ error: "agentId required" });

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const agent = await prisma.user.findFirst({ where: { id: agentId, role: "AGENT", active: true } });
  if (!agent) return res.status(400).json({ error: "Agent nahi mila" });

  const previousAgentId = customer.assignedAgentId;

  await prisma.customer.update({
    where: { id: customer.id },
    data: { assignedAgentId: agentId, status: "assigned" },
  });

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });

  const summary = await customerSummary(updated);

  if (previousAgentId && previousAgentId !== agentId) {
    emitAgent(previousAgentId, "conversation:unassigned", { customerId: customer.id, customer: summary });
  }

  emitAgent(agentId, "conversation:assigned", { customer: summary });
  emitStaff("chat:updated", { customer: summary });

  const noteText = (note || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];
  const createdNotes = [];

  if (noteText || files.length) {
    const lastFromCustomer = await prisma.message.findFirst({
      where: { customerId: customer.id, sender: "customer" },
      orderBy: { createdAt: "desc" },
    });

    if (noteText) {
      const quoted = lastFromCustomer
        ? lastFromCustomer.text
          ? `\n\nCustomer: "${lastFromCustomer.text}"`
          : "\n\nCustomer ka image/document attach kiya gaya"
        : "";
      const textNote = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "note",
          senderUserId: req.user.id,
          text: noteText + quoted,
          mediaType: files.length ? null : lastFromCustomer?.mediaType || null,
          mediaUrl: files.length ? null : lastFromCustomer?.mediaUrl || null,
        },
      });
      createdNotes.push(textNote);
    }

    for (const file of files) {
      const isImage = file.mimetype.startsWith("image/");
      const { url } = await saveUpload(file.buffer, file.originalname, file.mimetype);
      const m = await prisma.message.create({
        data: {
          customerId: customer.id,
          sender: "note",
          senderUserId: req.user.id,
          text: "",
          mediaType: isImage ? "image" : "document",
          mediaUrl: url,
        },
      });
      createdNotes.push(m);
    }

    const notePayload = { customerId: customer.id, notes: createdNotes };
    emitAgent(agentId, "chat:update", notePayload);
    emitStaff("chat:update", notePayload);
  }

  res.json({
    ok: true,
    customer: summary,
    note: createdNotes[0] || null,
    notes: createdNotes,
  });
}

export async function reply(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { bot: true },
  });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  const isAssignedAgent = customer.assignedAgentId === req.user.id;
  if (!isStaff && !isAssignedAgent) return res.status(403).json({ error: "Forbidden" });

  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const sent = await sendToCustomer(customer.bot, customer.telegramId, text.trim());

  const [msg] = await prisma.$transaction([
    prisma.message.create({
      data: {
        customerId: customer.id,
        sender: "agent",
        senderUserId: req.user.id,
        text: text.trim(),
        telegramMessageId: sent.message_id,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:update", {
      customerId: customer.id,
      messages: [msg],
      customer: await customerSummary(updated),
    });
  }
  emitStaff("chat:update", {
    customerId: customer.id,
    messages: [msg],
    customer: await customerSummary(updated),
  });

  res.json({ message: msg });
}

export async function sendMedia(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { bot: true },
  });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  const isAssignedAgent = customer.assignedAgentId === req.user.id;
  if (!isStaff && !isAssignedAgent) return res.status(403).json({ error: "Forbidden" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "file required" });

  const caption = (req.body.caption || "").trim();
  const isImage = file.mimetype.startsWith("image/");
  const fileName = file.originalname || `file${isImage ? ".jpg" : ""}`;

  let url;
  try {
    ({ url } = await saveUpload(file.buffer, file.originalname, file.mimetype));
    console.log("[media] saved ->", url.startsWith("/uploads/") ? "local disk" : "cloud storage");
  } catch (e) {
    console.error("[media] upload fail:", e.message);
    return res.status(500).json({ error: "Upload fail: " + e.message });
  }

  let tgMessageId = null;
  try {
    const buffer = await getUploadBuffer(url);
    const tempPath = getLocalFilePath(`tmp-${Date.now()}-${fileName}`);
    fs.writeFileSync(tempPath, buffer);
    try {
      const sent = await sendMediaToCustomer(
        customer.bot,
        customer.telegramId,
        tempPath,
        fileName,
        caption || undefined,
        isImage
      );
      tgMessageId = sent?.message_id;
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  } catch (e) {
    return res.status(400).json({ error: "Image customer ko nahi bheji gayi: " + e.message });
  }

  const [msg] = await prisma.$transaction([
    prisma.message.create({
      data: {
        customerId: customer.id,
        sender: "agent",
        senderUserId: req.user.id,
        text: caption,
        mediaType: isImage ? "image" : "document",
        mediaUrl: url,
        telegramMessageId: tgMessageId,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:update", {
      customerId: customer.id,
      messages: [msg],
      customer: await customerSummary(updated),
    });
  }
  emitStaff("chat:update", {
    customerId: customer.id,
    messages: [msg],
    customer: await customerSummary(updated),
  });

  res.json({ message: msg });
}

export async function addNote(req, res) {
  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (!isStaff) return res.status(403).json({ error: "Sirf owner/admin note likh sakta hai" });

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const msg = await prisma.message.create({
    data: {
      customerId: customer.id,
      sender: "note",
      senderUserId: req.user.id,
      text: text.trim(),
    },
  });

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:update", {
      customerId: customer.id,
      notes: [msg],
    });
  }
  emitStaff("chat:update", {
    customerId: customer.id,
    notes: [msg],
  });

  res.json({ message: msg });
}

export async function addNoteMedia(req, res) {
  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (!isStaff) return res.status(403).json({ error: "Sirf owner/admin note likh sakta hai" });

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "file required" });

  const caption = (req.body.caption || "").trim();
  const isImage = file.mimetype.startsWith("image/");

  let url;
  try {
    ({ url } = await saveUpload(file.buffer, file.originalname, file.mimetype));
    console.log("[note-media] saved ->", url.startsWith("/uploads/") ? "local disk" : "cloud storage");
  } catch (e) {
    console.error("[note-media] upload fail:", e.message);
    return res.status(500).json({ error: "Upload fail: " + e.message });
  }

  const msg = await prisma.message.create({
    data: {
      customerId: customer.id,
      sender: "note",
      senderUserId: req.user.id,
      text: caption,
      mediaType: isImage ? "image" : "document",
      mediaUrl: url,
    },
  });

  const notePayload = { customerId: customer.id, notes: [msg] };

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "chat:update", notePayload);
  }
  emitStaff("chat:update", notePayload);

  res.json({ message: msg });
}

export async function deleteMessage(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { bot: true },
  });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.customerId !== customer.id) {
    return res.status(404).json({ error: "Message nahi mila" });
  }

  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  const isOwnMessage = message.senderUserId && message.senderUserId === req.user.id;
  if (!isStaff && !isOwnMessage) {
    return res.status(403).json({ error: "Sirf apne bheje howe messages delete kar sakte ho" });
  }

  // Agent sirf tab delete kar sakta hai jab ab bhi assigned ho
  if (!isStaff && customer.assignedAgentId !== req.user.id) {
    return res.status(403).json({ error: "Aap ab is conversation ke assigned agent nahi hain" });
  }

  if (message.telegramMessageId) {
    await deleteTelegramMessage(customer.bot, customer.telegramId, message.telegramMessageId);
  }

  if (message.mediaUrl) {
    await deleteUpload(message.mediaUrl);
  }

  await prisma.message.delete({ where: { id: message.id } });

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });
  const summary = await customerSummary(updated);

  if (customer.assignedAgentId) {
    emitAgent(customer.assignedAgentId, "message:deleted", {
      customerId: customer.id,
      messageId: message.id,
      customer: summary,
    });
  }
  emitStaff("message:deleted", {
    customerId: customer.id,
    messageId: message.id,
    customer: summary,
  });

  res.json({ ok: true, messageId: message.id });
}

export async function close(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { bot: true },
  });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  const isAssignedAgent = customer.assignedAgentId === req.user.id;
  if (!isStaff && !isAssignedAgent) return res.status(403).json({ error: "Forbidden" });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { status: "closed" },
  });

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });
  const summary = await customerSummary(updated);

  emitStaff("chat:updated", { customer: summary });
  if (customer.assignedAgentId) emitAgent(customer.assignedAgentId, "chat:updated", { customer: summary });

  res.json({ ok: true, customer: summary });
}
