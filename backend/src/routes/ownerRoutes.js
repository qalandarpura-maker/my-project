import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { diagnostics } from "../controllers/diagnosticsController.js";
import {
  addBot,
  listBots,
  removeBot,
  toggleBot,
  updateBotGreeting,
  createAdmin,
  createAgent,
  listAdmins,
  listAgents,
  removeUser,
} from "../controllers/ownerController.js";

const router = Router();
router.use(requireAuth, requireRole("OWNER"));

router.get("/diagnostics", diagnostics);

router.post("/bots", addBot);
router.get("/bots", listBots);
router.delete("/bots/:id", removeBot);
router.patch("/bots/:id/status", toggleBot);
router.patch("/bots/:id/greeting", updateBotGreeting);

router.post("/admins", createAdmin);
router.get("/admins", listAdmins);
router.delete("/admins/:id", (req, res) => removeUser(req, res, "ADMIN"));

router.post("/agents", createAgent);
router.get("/agents", listAgents);
router.delete("/agents/:id", (req, res) => removeUser(req, res, "AGENT"));

export default router;