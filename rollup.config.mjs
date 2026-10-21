import typescript from '@rollup/plugin-typescript';
import alias from '@rollup/plugin-alias';
import path from 'path';
import ts from 'typescript';
import fs from 'node:fs';

function gasEntrypoints() {
  return { name: 'explicit-gas-entrypoints', generateBundle(_options, bundle) {
    const source = ts.createSourceFile('index.ts', fs.readFileSync('src/index.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const names = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'register') {
        const object = node.arguments[0];
        if (!ts.isObjectLiteralExpression(object)) throw new Error('Explicit register object required');
        for (const property of object.properties) {
          if (!ts.isShorthandPropertyAssignment(property)) throw new Error('Explicit shorthand entrypoint required');
          names.push(property.name.text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (!names.length || new Set(names).size !== names.length) throw new Error('Invalid GAS entrypoint list');
    const allowed = JSON.parse(fs.readFileSync('gas-production-entrypoints.json', 'utf8'));
    if (JSON.stringify([...names].sort()) !== JSON.stringify([...allowed].sort())) throw new Error('Production entrypoint allowlist mismatch');
    const chunk = bundle['Code.gs'];
    chunk.code += '\n' + names.map(name => `function ${name}() { return __kubGasHandlers_.${name}.apply(null, arguments); }`).join('\n') + '\n';
  } };
}

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/Code.gs',
    format: 'iife', // 🔥 назад
    banner: 'var __kubGasHandlers_ = {};',
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
    gasEntrypoints(),
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

// раніше було format: 'iife', і код компілювався
