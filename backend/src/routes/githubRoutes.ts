/** GitHub integration routes — mounted at /api/github (Phase 3 §33). */
import { Router } from 'express';

import {
  callback,
  connect,
  disconnect,
  listRepositories,
  profile,
  repositoryDetail,
  status,
  sync,
  syncStatus
} from '../controllers/githubController.js';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// OAuth flow endpoints: connect requires a session; callback uses optionalAuth
// so it can render a clean redirect when the session expired mid-flow.
router.get('/connect', requireAuth, connect);
router.get('/callback', optionalAuth, callback);

// Data + sync endpoints (DevDNA authentication).
router.get('/status', requireAuth, status);
router.get('/profile', requireAuth, profile);
router.post('/sync', requireAuth, authLimiter, sync);
router.get('/sync/:jobId', requireAuth, syncStatus);
router.delete('/disconnect', requireAuth, disconnect);

// Repository browsing.
router.get('/repositories', requireAuth, listRepositories);
router.get('/repositories/:id', requireAuth, repositoryDetail);

export default router;
