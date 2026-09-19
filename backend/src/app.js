import express from "express";
import cors from "cors";
import helmet from "helmet";
import { initSocket } from "./lib/socket.js";
import { ensureUploadsDir, getLocalFilePath } from "./lib/uploads.js";
import authRoutes from "./routes/authRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import { requireAuth } from "./middleware/auth.js";
import { startAllBots } from "./telegram/handlers.js";

function parseOrigins() {
  const raw = process.env.FRONTEND_URL;
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FRONTEND_URL environment variable is required in production");
  }
  return true;
}

export function getAllowedOrigins() {
  return parseOrigins();
}

export async function createApp() {
  ensureUploadsDir();
  const app = express();

  const FRONTEND = getAllowedOrigins();

  app.use(helmet());
  app.use(cors({ origin: FRONTEND, credentials: true }));
  app.use(express.json());

  // Local uploads authenticated route
  app.get("/uploads/:name", requireAuth, (req, res) => {
    const name = req.params.name;
    if (!name || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid file name" });
    }
    const filePath = getLocalFilePath(name);
    res.sendFile(filePath, (err) => {
      if (err) {
        if (!res.headersSent) res.status(404).json({ error: "File not found" });
      }
    });
  });

  app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/owner", ownerRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/staff", staffRoutes);
  app.use("/api/conversations", conversationRoutes);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  // Global error handler — async errors bhi proper JSON denge
  app.use((err, req, res, next) => {
    console.error("[error]", err?.message || err);
    if (res.headersSent) return next(err);
    const status = err?.status || err?.statusCode || (err?.type === "entity.too.large" ? 413 : 500);
    res.status(status).json({ error: err?.message || "Internal server error" });
  });

  await startAllBots();

  return app;
}

export function attachSocket(server) {
  return initSocket(server, getAllowedOrigins());
}

