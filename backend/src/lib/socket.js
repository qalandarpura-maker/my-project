import { Server } from "socket.io";

let io = null;

export function initSocket(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin || true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("unauthorized"));
      const { verifyToken } = await import("./jwt.js");
      const payload = verifyToken(token);
      socket.user = payload;
      next();
    } catch (e) {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) return;
    if (user.role === "OWNER" || user.role === "ADMIN") {
      socket.join("inbox");
    }
    if (user.role === "AGENT") {
      socket.join(`agent:${user.id}`);
    }
    socket.join(`user:${user.id}`);
  });

  return io;
}

export function getIo() {
  return io;
}

export function emitStaff(event, data) {
  io?.to("inbox").emit(event, data);
}

export function emitAgent(agentId, event, data) {
  io?.to(`agent:${agentId}`).emit(event, data);
}

export function emitUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data);
}