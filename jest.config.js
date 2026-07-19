/** Jest config — Week 3 transpiler unit tests (Node, ts-jest). */
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', esModuleInterop: true } },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}
