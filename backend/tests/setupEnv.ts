/**
 * Jest bootstrap — runs before any test module import.
 * Forces NODE_ENV=test so config validation uses test defaults and the
 * rate limiters skip; points Mongo at an isolated devdna_test database.
 */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/devdna_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-16-chars';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
// Phase 3 — OAuth + token encryption are exercised with test-only values.
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_TOKEN_ENCRYPTION_KEY = 'test-github-token-encryption-key';
process.env.GITHUB_CALLBACK_URL = 'http://localhost:5000/api/github/callback';
