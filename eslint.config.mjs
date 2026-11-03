import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';

const roleLiteral =
  'Literal[value=/^(ADMIN|HEAD_RECRUITER|RECRUITER|HEAD_HR|HR|TEAM_LEAD|FINANCE)$/]';
const roleMessage =
  'Authorize with permission codes via server/authz (can, requirePermission), never role names (ROLE-04, SEC-CORE-08).';
/** Role-name comparisons are allowed only inside server/authz and the DB layer that stores role codes. */
const roleComparisons = [
  `BinaryExpression[operator=/^[!=]==?$/] > ${roleLiteral}`,
  `SwitchCase > ${roleLiteral}.test`,
  `CallExpression[callee.property.name=/^(includes|has|indexOf)$/] > ${roleLiteral}.arguments`,
].map((selector) => ({ selector, message: roleMessage }));

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.next-dev/**',
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
                '**/server/db',
                '**/server/db/*',
                '**/server/repositories/*',
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
    files: ['**/*.{ts,tsx}'],
    ignores: ['server/authz/**', 'server/db/**', 'tests/**', 'scripts/**'],
    rules: { 'no-restricted-syntax': ['error', ...roleComparisons] },
  },
  {
    files: ['app/api/v1/**/route.ts'],
    ignores: ['app/api/v1/auth/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...roleComparisons,
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
  {
    // Sign-in and session endpoints may also use the explicit auth wrappers (public or cookie-writing).
    files: ['app/api/v1/auth/**/route.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...roleComparisons,
        {
          selector: 'ExportNamedDeclaration > FunctionDeclaration',
          message: 'Build /api/v1 handlers with defineRoute() (ADR-006).',
        },
        {
          selector:
            'ExportNamedDeclaration VariableDeclarator[id.name=/^(GET|POST|PUT|PATCH|DELETE)$/]:not([init.callee.name=/^(defineRoute|definePublicAuthRoute|defineAuthenticatedAuthRoute)$/])',
          message:
            'Build /api/v1/auth handlers with defineRoute() or the auth wrappers from server/services/auth/app.ts (ADR-006).',
        },
      ],
    },
  },
  {
    // Postman sandbox scripts, merged into tests/postman/collection.json by scripts/postman.ts.
    files: ['tests/postman/tests/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { pm: 'readonly' } },
  },
);
