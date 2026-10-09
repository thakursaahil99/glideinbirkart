/** End-to-end tests: boots the real Nest app against the glideinbir_kart_test database. */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json', diagnostics: false }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 60000,
};
