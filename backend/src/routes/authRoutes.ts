/** Auth routes — mounted at /api/auth (rate limits per requirement §30). */
import { Router } from 'express';

import {
  changePasswordHandler,
  forgotPassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
  resetPasswordHandler,
  sessions
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refresh);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordHandler);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAll);
router.get('/me', requireAuth, me);
router.get('/sessions', requireAuth, sessions);
router.patch('/password', requireAuth, authLimiter, changePasswordHandler);

export default router;
