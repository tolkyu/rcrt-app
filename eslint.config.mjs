import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.cache/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': hooks,
      'jsx-a11y': a11y,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.flatConfigs.recommended.rules,
      'react/no-danger': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: true, ignoreProps: true },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/server/db',
                '@/server/db/*',
                '@/server/repositories/*',
              ],
              message:
                'app/ reaches data only through server/services (CLAUDE.md §3).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/api/v1/**/route.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > FunctionDeclaration',
          message: 'Build /api/v1 handlers with defineRoute() (ADR-006).',
        },
        {
          selector:
            "ExportNamedDeclaration VariableDeclarator[id.name=/^(GET|POST|PUT|PATCH|DELETE)$/]:not([init.callee.name='defineRoute'])",
          message: 'Build /api/v1 handlers with defineRoute() (ADR-006).',
        },
      ],
    },
  },
);
