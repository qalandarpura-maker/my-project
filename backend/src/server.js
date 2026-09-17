import "dotenv/config";
import http from "http";
import { createApp, attachSocket } from "./app.js";

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    const app = await createApp();
    const server = http.createServer(app);
    attachSocket(server);

    server.listen(PORT, () => {
      console.log(`API started on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("Server startup fail:", e.message);
    process.exit(1);
  }
}

main();