import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'coverage/**',
      'docs/**',
      'store/**',
      'playwright-report/**',
      'test-results/**',
      'chromium-profile/**',
      'dist/**',
      'build/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      // Not the type-checked preset: it needs type information and is slow.
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
    },
  },
  {
    // This PR adds linting without touching source. Rules that the existing code
    // trips often are downgraded to `warn` so CI stays green; fix and re-enable
    // them as errors in follow-ups.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Many `any`s in message payloads, DOM glue and tests.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
      'prefer-const': 'warn',
      // New React Compiler-era rules in eslint-plugin-react-hooks 7; the code
      // base predates them (e.g. setState in effects is used for data loading).
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/refs': 'warn',
      // One existing hit, a false positive: a class method named `useReadableContent`.
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
  {
    files: ['src/entrypoints/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['src/components/ui/**', '**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['warn', { mode: 'jsx-text-only' }],
    },
  },
);
