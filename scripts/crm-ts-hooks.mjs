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
