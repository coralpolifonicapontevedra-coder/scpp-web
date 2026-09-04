import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '.astro/**',
      'dist/**',
      'node_modules/**',
      'public/**',
      'apps-script/**',
      'apps-script-*/**',
      'scripts/**/*.py',
      'patch-governanza-production.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,astro}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        HTMLRewriter: 'readonly',
      },
    },
    rules: {
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // O alta de audios elimina deliberadamente caracteres de control do nome do ficheiro.
    files: ['functions/api/repertorio-admin-altas.js'],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    // Excepción acoutada ao formulario de Repertorio xa validado en Preview.
    files: ['src/pages/portal/administracion/repertorio.astro'],
    rules: {
      '@typescript-eslint/no-wrapper-object-types': 'off',
    },
  },
];
