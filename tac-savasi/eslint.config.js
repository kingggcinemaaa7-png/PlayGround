// ESLint flat config — TypeScript, browser + node targets, zero runtime deps.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/data/**', 'tools/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['client/src/**/*.ts', 'shared/src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // the render layer legitimately touches loosely typed Pixi objects
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // simulation/render hot paths: keep unused args out but allow void discards
      'no-void': ['error', { allowAsStatement: true }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['server/src/**/*.ts', 'shared/src/**/*.ts', 'tools/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
