import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createAgent, listAgents, removeUser } from "../controllers/ownerController.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.post("/agents", createAgent);
router.get("/agents", listAgents);
router.delete("/agents/:id", (req, res) => removeUser(req, res, "AGENT"));

export default router;