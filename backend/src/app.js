import express from "express";
import cors from "cors";
import { initSocket } from "./lib/socket.js";
import { ensureUploadsDir, UPLOADS_DIR } from "./lib/uploads.js";
import authRoutes from "./routes/authRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import { startAllBots } from "./telegram/handlers.js";

export async function createApp() {
  ensureUploadsDir();
  const app = express();

  const FRONTEND = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : true;
  app.use(cors({ origin: FRONTEND, credentials: true }));
  app.use(express.json());
  app.use("/uploads", express.static(UPLOADS_DIR));

  app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/owner", ownerRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/staff", staffRoutes);
  app.use("/api/conversations", conversationRoutes);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  await startAllBots();

  return app;
}

export function attachSocket(server) {
  return initSocket(server, process.env.FRONTEND_URL || true);
}