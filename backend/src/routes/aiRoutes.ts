/** AI routes — mounted at /api/ai (Phase 6 §8). */
import { Router } from 'express';

import {
  aiStatus,
  deleteConversation,
  getConversation,
  getInsightCard,
  listConversations,
  sendChatMessage
} from '../controllers/aiController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/status', requireAuth, aiStatus);
router.post('/chat', requireAuth, aiLimiter, sendChatMessage);
// Insight reads are cache-first (Mongo hit ⇒ no LLM call), so they stay under
// the global API limiter; strict aiLimiter applies to generation endpoints only.
router.get('/insights/:insightType', requireAuth, getInsightCard);
router.get('/conversations', requireAuth, listConversations);
router.get('/conversations/:conversationId', requireAuth, getConversation);
router.delete('/conversations/:conversationId', requireAuth, deleteConversation);

export default router;
