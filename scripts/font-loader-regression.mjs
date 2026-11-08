// Reproduces the Next.js 14.2.35 google font loader crash condition and checks
// the layout no longer takes that path. Run: node scripts/font-loader-regression.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const extensionless = 'https://fonts.gstatic.com/l/font?kit=UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA&skey=c491285d6722e4fa&v=v20';
const suffixed = 'https://fonts.gstatic.com/s/newsreader/v26/example.woff2';
const ext = /\.(woff|woff2|eot|ttf|otf)$/;
assert(ext.exec(extensionless) === null, 'extensionless Google kit URL is the loader crash input');
assert(ext.exec(suffixed)?.[1] === 'woff2', 'a normal woff2 URL still has an extension');

let crashed = false;
try {
  const value = ext.exec(extensionless)[1];
  void value;
} catch (error) {
  crashed = error instanceof TypeError && String(error.message).includes("reading '1'");
}
assert(crashed, 'reading [1] on that miss throws the Vercel TypeError');

const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
assert(!layout.includes("from 'next/font/google'"), 'layout does not import next/font/google');
assert(layout.includes("from 'next/font/local'"), 'layout loads fonts with next/font/local');
assert(layout.includes("weight: '400'") && layout.includes("style: 'italic'"), 'Newsreader keeps weight 400 and italic');
assert(layout.includes("weight: '400 500'"), 'Inter Tight keeps weights 400 and 500');
assert(layout.includes("weight: '500'"), 'IBM Plex Mono keeps weight 500');
for (const variable of ['--font-newsreader', '--font-inter-tight', '--font-ibm-plex-mono']) {
  assert(layout.includes(variable), `layout still sets ${variable}`);
}

const fontDir = new URL('../src/fonts/', import.meta.url);
const files = readdirSync(fontDir).filter((name) => name.endsWith('.woff2'));
assert(files.length === 5, 'five vendored woff2 files');
for (const name of files) {
  const bytes = readFileSync(new URL(name, fontDir));
  assert(bytes.subarray(0, 4).toString() === 'wOF2', `${name} is a woff2 file`);
}
for (const license of ['OFL-Newsreader.txt', 'OFL-Inter-Tight.txt', 'OFL-IBM-Plex-Mono.txt']) {
  const text = readFileSync(join(fontDir.pathname, license), 'utf8');
  assert(text.includes('SIL Open Font License'), `${license} is the SIL OFL`);
}

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('font loader regression passed');
