import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'

const javascriptFiles = '**/*.{js,mjs,cjs,jsx}'

export default [
  {
    name: 'project/ignores',
    ignores: ['artifacts/**', 'data/**', 'dist/**', 'node_modules/**'],
  },
  {
    ...js.configs.recommended,
    files: [javascriptFiles],
  },
  {
    name: 'project/base',
    files: [javascriptFiles],
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
    name: 'project/browser',
    files: ['src/**/*.{js,jsx}'],
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
    files: ['src/**/*.{js,jsx}'],
  },
  {
    ...reactRefresh.configs.vite,
    name: 'project/react-refresh',
    files: ['src/**/*.jsx'],
  },
  {
    name: 'project/node',
    files: [
      'eslint.config.js',
      'forge.config.cjs',
      'vite.config.js',
      'desktop/**/*.{js,mjs,cjs}',
      'server/**/*.{js,mjs,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      'test/**/*.{js,mjs,cjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
]
