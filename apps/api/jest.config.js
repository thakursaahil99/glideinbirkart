/** Unit tests: services with mocked collaborators. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json', diagnostics: true }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
};
