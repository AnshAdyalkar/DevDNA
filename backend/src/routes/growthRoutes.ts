/** Growth routes — mounted at /api/growth (Phase 5 §17). */
import { Router } from 'express';

import {
  analyze,
  getGaps,
  getOutdated,
  getProject,
  getRoadmap,
  jobStatus,
  listProjects,
  listRoles,
  patchProgress,
  regenerate
} from '../controllers/growthController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/roles', requireAuth, listRoles);
router.post('/analyze', requireAuth, authLimiter, analyze);
router.get('/status/:jobId', requireAuth, jobStatus);
router.get('/gaps', requireAuth, getGaps);
router.get('/roadmap', requireAuth, getRoadmap);
router.post('/roadmap/regenerate', requireAuth, authLimiter, regenerate);
router.patch('/roadmap/progress', requireAuth, patchProgress);
router.get('/projects', requireAuth, listProjects);
router.get('/projects/:id', requireAuth, getProject);
router.get('/outdated', requireAuth, getOutdated);

export default router;
