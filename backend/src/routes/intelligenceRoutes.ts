/** Intelligence routes — mounted at /api/intelligence (Phase 4 §22). */
import { Router } from 'express';

import {
  analyze,
  getDna,
  getRepositoryAnalysis,
  jobStatus,
  latestJob,
  listRepositoryAnalyses
} from '../controllers/intelligenceController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/analyze', requireAuth, authLimiter, analyze);
router.get('/status/:jobId', requireAuth, jobStatus);
router.get('/jobs', requireAuth, latestJob);
router.get('/dna', requireAuth, getDna);
router.get('/repositories', requireAuth, listRepositoryAnalyses);
router.get('/repositories/:id', requireAuth, getRepositoryAnalysis);

export default router;
