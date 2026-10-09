import next from '@gk/config/eslint/next';

export default [
  ...next,
  {
    ignores: [
      '.next/**',
      'next-env.d.ts',
      'e2e/**',
      'playwright-report/**',
      'test-results/**',
      'tailwind.config.js',
      'postcss.config.*',
    ],
  },
  {
    rules: {
      // Images from the API are SVG/Cloudinary; the <Img> wrapper decides when to optimise.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
