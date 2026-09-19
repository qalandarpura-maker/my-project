import { Router } from "express";
import { login, me } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/login", loginLimiter, login);
router.get("/me", requireAuth, me);

export default router;