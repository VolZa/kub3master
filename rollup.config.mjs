import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/Code.gs',
    format: 'es', // 🔥 назад
    sourcemap: true, // 🔥 додали
  },
  plugins: [typescript()],
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
