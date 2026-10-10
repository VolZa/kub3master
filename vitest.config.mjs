/**
 * Path: C:/www/26/03/kub3master-ts/vitest.config.mjs
 * Module: Test Infrastructure
 * Layer: Infrastructure
 * Responsibility: resolve existing src-root imports for local Vitest integration tests.
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));

// Automatic suites opt in by importing Vitest in a *.test.* or *.spec.* file.
// Manual GAS functions and placeholders remain outside local discovery.
// Inspect imports with the TypeScript parser so commented examples do not opt in.
function automatedSuites(directory, relative = 'src') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return automatedSuites(absolute, name);
    if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    const source = ts.createSourceFile(name, readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
    const importsVitest = source.statements.some((statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'vitest',
    );
    return importsVitest ? [name] : [];
  });
}

export default defineConfig({
  test: {
    include: automatedSuites(resolve(projectDirectory, 'src')),
  },
  resolve: {
    alias: ['domain', 'technology', 'core', 'shared', 'modules', 'utils', 'config',
      'services', 'app', 'infrastructure'].map((name) => ({
      find: name, replacement: resolve(projectDirectory, 'src', name),
    })),
  },
});
