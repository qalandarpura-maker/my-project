import prisma from "../lib/prisma.js";
import { sendToCustomer, sendMediaToCustomer, deleteTelegramMessage } from "../telegram/handlers.js";
import { emitAgent, emitStaff } from "../lib/socket.js";
import { saveBuffer, extForMime, getFilePath } from "../lib/uploads.js";

async function customerSummary(customer) {
  const lastMsg = await prisma.message.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  let lastMessage = lastMsg?.text || null;
  if (!lastMessage && lastMsg?.mediaType) lastMessage = lastMsg.mediaType === "image" ? "(image)" : "(document)";
  if (!lastMessage && lastMsg?.sender === "note") lastMessage = "📝 note";
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
  };
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

export async function assign(req, res) {
  const isStaff = req.user.role === "OWNER" || req.user.role === "ADMIN";
  if (!isStaff) return res.status(403).json({ error: "Forbidden" });

  const { agentId, note } = req.body || {};
  if (!agentId) return res.status(400).json({ error: "agentId required" });

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Conversation nahi mila" });

  const agent = await prisma.user.findFirst({ where: { id: agentId, role: "AGENT", active: true } });
  if (!agent) return res.status(400).json({ error: "Agent nahi mila" });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { assignedAgentId: agentId, status: "assigned" },
  });

  const updated = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { bot: true, assignedAgent: { select: { id: true, name: true } } },
  });

  emitAgent(agentId, "conversation:assigned", { customer: await customerSummary(updated) });
  emitStaff("chat:updated", { customer: await customerSummary(updated) });

  // Forward ke sath note + images: customer ka aakhri message (text + image/document) note ke sath agent ko
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
          ? `\n\n↩️ Customer: "${lastFromCustomer.text}"`
          : "\n\n↩️ Customer ka image/document attach kiya gaya"
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
      const ext = extForMime(file.mimetype);
      const { url } = saveBuffer(file.buffer, ext);
      const isImage = file.mimetype.startsWith("image/");
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
    customer: await customerSummary(updated),
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

  const msg = await prisma.message.create({
    data: {
      customerId: customer.id,
      sender: "agent",
      senderUserId: req.user.id,
      text: text.trim(),
      telegramMessageId: sent.message_id,
    },
  });

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

  const ext = extForMime(file.mimetype);
  const { name, url } = saveBuffer(file.buffer, ext);
  const caption = (req.body.caption || "").trim();
  const isImage = file.mimetype.startsWith("image/");

  try {
    const sent = await sendMediaToCustomer(
      customer.bot,
      customer.telegramId,
      getFilePath(name),
      name,
      caption || undefined,
      isImage
    );
    var tgMessageId = sent?.message_id;
  } catch (e) {
    return res.status(400).json({ error: "Image customer ko nahi bheji gayi: " + e.message });
  }

  const msg = await prisma.message.create({
    data: {
      customerId: customer.id,
      sender: "agent",
      senderUserId: req.user.id,
      text: caption,
      mediaType: isImage ? "image" : "document",
      mediaUrl: url,
      telegramMessageId: tgMessageId,
    },
  });

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

  const ext = extForMime(file.mimetype);
  const { url } = saveBuffer(file.buffer, ext);
  const caption = (req.body.caption || "").trim();
  const isImage = file.mimetype.startsWith("image/");

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

  if (message.telegramMessageId) {
    await deleteTelegramMessage(customer.bot, customer.telegramId, message.telegramMessageId);
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