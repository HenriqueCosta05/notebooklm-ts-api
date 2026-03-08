import { Router } from "express";
import {
  askQuestion,
  getConversationId,
  getConversationHistory,
  getCachedTurns,
  clearConversationCache,
  configureChat,
  setChatMode,
} from "../controllers/chat.controller";

const router = Router({ mergeParams: true });

router.post("/ask", askQuestion);
router.get("/conversation-id", getConversationId);
router.get("/history", getConversationHistory);
router.get("/cache/:conversationId", getCachedTurns);
router.delete("/cache", clearConversationCache);
router.delete("/cache/:conversationId", clearConversationCache);
router.put("/configure", configureChat);
router.put("/mode", setChatMode);

export { router as chatRouter };
