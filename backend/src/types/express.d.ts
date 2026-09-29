/** Type augmentation for authenticated requests (loaded via tsconfig `types`/include). */
import type { UserDocument } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth middleware for authenticated routes. */
      user?: UserDocument;
      /** Set by token verification for refresh flows. */
      auth?: { userId: string; sessionId: string; type: 'access' | 'refresh' };
    }
  }
}

export {};
