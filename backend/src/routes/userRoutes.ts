/** User routes — mounted at /api/users. */
import { Router } from 'express';

import { deleteMe, getMe, updateMe } from '../controllers/userController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, updateMe);
router.delete('/me', requireAuth, deleteMe);

export default router;
