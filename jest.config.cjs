module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.cjs'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          experimentalDecorators: true,
          isolatedModules: true,
          skipLibCheck: true
        }
      }
    ]
  },
  moduleNameMapper: {
    '^@growchief/shared-backend/(.*)$': '<rootDir>/shared/server/$1',
    '^@growchief/shared-both/(.*)$': '<rootDir>/shared/both/$1',
    '^@growchief/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
    '^@growchief/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1'
  }
};
