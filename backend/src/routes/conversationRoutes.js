import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import {
  listCustomers,
  getConversation,
  assign,
  reply,
  sendMedia,
  addNote,
  addNoteMedia,
  deleteMessage,
  close,
} from "../controllers/conversationController.js";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Agent ko assign karne ke liye agents ka list (staff ke liye)
router.get("/", listCustomers);
router.get("/:id", getConversation);
router.post("/:id/assign", upload.array("files", 10), assign);
router.post("/:id/reply", reply);
router.post("/:id/send-media", upload.single("file"), sendMedia);
router.post("/:id/note", addNote);
router.post("/:id/note-media", upload.single("file"), addNoteMedia);
router.delete("/:id/messages/:messageId", deleteMessage);
router.post("/:id/close", close);

export default router;