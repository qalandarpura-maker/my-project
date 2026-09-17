import { io } from "socket.io-client";

export let socket = null;

export function connectSocket(token) {
  socket = io({ auth: { token }, transports: ["websocket"] });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}