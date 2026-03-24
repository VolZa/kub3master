import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/Code.gs',
    format: 'iife', // 🔥 ГОЛОВНЕ
    name: 'AppKub', // будь-яке ім’я
  },
  plugins: [typescript()],
  treeshake: false,
};

// format: 'es',
