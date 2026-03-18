import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/Code.gs',
    format: 'es',
  },
  plugins: [typescript()],
  treeshake: false,
};
