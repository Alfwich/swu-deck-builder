import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

const javascriptFiles = '**/*.{js,mjs,cjs,jsx}'
const typescriptFiles = '**/*.{ts,mts,cts,tsx}'
const sourceFiles = '**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'

export default [
  {
    name: 'project/ignores',
    ignores: ['.runtime/**', 'artifacts/**', 'data/**', 'dist/**', 'node_modules/**'],
  },
  {
    ...js.configs.recommended,
    files: [javascriptFiles],
  },
  {
    name: 'project/base',
    files: [sourceFiles],
    plugins: {
      sonarjs,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'no-duplicate-imports': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'sonarjs/cognitive-complexity': ['error', 12],
    },
  },
  {
    name: 'project/typescript',
    files: [typescriptFiles],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    name: 'project/browser',
    files: ['src/web/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    name: 'project/react-hooks',
    files: ['src/web/**/*.{js,jsx,ts,tsx}'],
  },
  {
    ...reactRefresh.configs.vite,
    name: 'project/react-refresh',
    files: ['src/web/**/*.{jsx,tsx}'],
  },
  {
    name: 'project/node',
    files: [
      'eslint.config.js',
      'forge.config.cjs',
      'vite.config.ts',
      'src/desktop/**/*.{js,mjs,cjs}',
      'src/server/**/*.{js,mjs,cjs}',
      'src/shared/**/*.{js,mjs,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      'test/**/*.{js,mjs,cjs}',
      'src/desktop/**/*.{ts,mts,cts}',
      'src/server/**/*.{ts,mts,cts}',
      'src/shared/**/*.{ts,mts,cts}',
      'scripts/**/*.{ts,mts,cts}',
      'test/**/*.{ts,mts,cts,tsx}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
]
