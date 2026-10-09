const { light } = require('@gk/ui/tokens');

// Same token names as the web preset, mapped to CSS variables defined in global.css
const colors = Object.fromEntries(
  Object.keys(light).map((n) => [n, `hsl(var(--${n}) / <alpha-value>)`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors, borderRadius: { lg: '12px', md: '10px', sm: '8px' } } },
  plugins: [],
};
