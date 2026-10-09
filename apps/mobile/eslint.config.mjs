import base from '@gk/config/eslint/base';
import globals from 'globals';

export default [
  ...base,
  { ignores: ['dist/**', '.expo/**', 'babel.config.js', 'metro.config.js', 'tailwind.config.js'] },
  {
    languageOptions: {
      globals: { ...globals.es2023, __DEV__: 'readonly', require: 'readonly', process: 'readonly' },
    },
    rules: {
      // Expo/Metro inline `require` for lazy native modules (e.g. react-native-razorpay in Expo Go).
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
