import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAgents } from "../controllers/ownerController.js";

const router = Router();
router.use(requireAuth, requireRole("OWNER", "ADMIN"));

router.get("/agents", listAgents);

export default router;