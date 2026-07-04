import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules'] },

  // All TypeScript: JS + TS recommended (not type-checked).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },

  // Renderer: browser globals + React Hooks rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: { globals: globals.browser },
  },

  // Main process and tests run under Node.
  {
    files: ['electron/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  }
);
