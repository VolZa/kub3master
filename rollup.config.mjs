import typescript from '@rollup/plugin-typescript';
import alias from '@rollup/plugin-alias';
import path from 'path';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/Code.gs',
    format: 'es', // 🔥 назад
    sourcemap: true, // 🔥 додали
  },
  plugins: [
    alias({
      entries: [
        {
          find: 'domain/*',
          replacement: path.resolve('src/domain/*'),
        },
        {
          find: 'technology/*',
          replacement: path.resolve('src/technology/*'),
        },
        { find: 'core/*', replacement: path.resolve('src/core/*') },
        {
          find: 'shared/*',
          replacement: path.resolve('src/shared/*'),
        },
      ],
    }),
    typescript(),
  ],
  treeshake: false,
};

// import typescript from '@rollup/plugin-typescript';

// export default {
//   input: 'src/index.ts',
//   output: {
//     file: 'dist/Code.gs',
//     format: 'iife',
//     intro: '', // 🔥
//     outro: '', // 🔥
//   },
//   plugins: [typescript()],
//   treeshake: false,
// };

// раніше було format: 'es', і код компілювався
