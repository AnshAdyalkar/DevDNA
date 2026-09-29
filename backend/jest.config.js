/** Jest config for the Node.js backend (ESM + ts-jest). */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          types: ['node', 'jest'],
          strict: true,
          exactOptionalPropertyTypes: false,
          noUncheckedIndexedAccess: false
        }
      }
    ]
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts']
};
