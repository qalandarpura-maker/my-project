import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { fileFilter } from "../lib/uploads.js";
import {
  listCustomers,
  getConversation,
  getUnreadCount,
  markAsRead,
  assign,
  reply,
  sendMedia,
  addNote,
  addNoteMedia,
  deleteMessage,
  close,
  deleteConversation,
} from "../controllers/conversationController.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter,
});

router.get("/", listCustomers);
router.get("/unread-count", getUnreadCount);
router.get("/:id", getConversation);
router.post("/:id/read", markAsRead);
router.post("/:id/assign", upload.array("files", 10), assign);
router.post("/:id/reply", reply);
router.post("/:id/send-media", upload.single("file"), sendMedia);
router.post("/:id/note", addNote);
router.post("/:id/note-media", upload.single("file"), addNoteMedia);
router.delete("/:id/messages/:messageId", deleteMessage);

router.post("/:id/close", close);

router.delete("/:id", deleteConversation);
export default router;