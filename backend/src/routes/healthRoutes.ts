import { Router } from 'express';

import { healthHandler, statusHandler } from '../controllers/healthController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/health', healthHandler);
router.get('/status', apiLimiter, statusHandler);

export default router;
