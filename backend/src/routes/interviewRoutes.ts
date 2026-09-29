/** Interview routes — mounted at /api/interviews (Phase 6 §13). */
import { Router } from 'express';

import {
  answer,
  complete,
  create,
  detail,
  list,
  remove,
  start
} from '../controllers/interviewController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/', requireAuth, aiLimiter, create);
router.get('/', requireAuth, list);
router.get('/:sessionId', requireAuth, detail);
router.post('/:sessionId/start', requireAuth, aiLimiter, start);
router.post('/:sessionId/answer', requireAuth, aiLimiter, answer);
router.post('/:sessionId/complete', requireAuth, aiLimiter, complete);
router.delete('/:sessionId', requireAuth, remove);

export default router;
