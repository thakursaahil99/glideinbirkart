import base from './base.mjs';

export default [
  ...base,
  {
    rules: {
      // Nest relies on runtime imports for DI tokens, so type-only imports break metadata.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
