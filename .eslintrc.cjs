module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true,
    jest: true,
  },
  globals: {
    __DEV__: true,
    fetch: true,
    FormData: true,
    Blob: true,
    File: true,
    console: true,
    process: true,
    navigator: true,
    ReactNative: true,
    setInterval: true,
    clearInterval: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  plugins: ['react', '@typescript-eslint', 'react-hooks'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // General
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // React
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    // TypeScript
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // React Hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Avoid impure functions in render
    'react-hooks/purity': 'error',
    // Prettier
    'prettier/prettier': 'error',
    // React JSX quotes
    'react/jsx-quotes': ['error', 'prefer-double'],
  },
};