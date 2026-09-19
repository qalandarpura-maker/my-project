import { io } from "socket.io-client";

export let socket = null;

export function connectSocket(token) {
  if (socket) {
    socket.disconnect();
  }
  const url = import.meta.env.VITE_SOCKET_URL || undefined;
  // websocket preferred, lekin polling fallback bhi rakho (corporate proxies ke liye)
  socket = io(url, { auth: { token }, transports: ["websocket", "polling"] });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
