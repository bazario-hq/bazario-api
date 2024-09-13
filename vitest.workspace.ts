import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      globalSetup: ['tests/support/global-setup.ts'],
      setupFiles: ['tests/support/setup-env.ts'],
      pool: 'forks',
      testTimeout: 10_000,
      hookTimeout: 30_000,
    },
  },
]);
