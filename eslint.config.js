import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Migrations are written against an untyped Kysely instance on purpose:
    // they must keep working after the Database interface changes.
    files: ['src/db/migrations/**', 'src/db/migrator.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
