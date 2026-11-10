import { readFileSync } from 'node:fs';
import ts from 'typescript';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const url = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url);
    return { url: url.href, shortCircuit: true };
  }
  const hasExtension = EXTENSIONS.some((ext) => specifier.endsWith(ext));
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !hasExtension) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.tsx')) return nextLoad(url, context);
  const source = readFileSync(new URL(url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: url,
  });
  return { format: 'module', source: output.outputText, shortCircuit: true };
}
