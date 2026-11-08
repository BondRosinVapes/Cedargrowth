// Checks the self-hosted fonts against the Next.js 14.2.35 google loader
// behavior and the 8 Nov 2026 CSS observation. Run:
// node scripts/font-loader-regression.mjs
//
// The observation is not a captured historical production response.
// Set FONT_REQUIRE_BUILD=1 after `next build` to also read the emitted CSS.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { findFontFilesInCss } = require('next/dist/compiled/@next/font/dist/google/find-font-files-in-css.js');
const { calculateSizeAdjustValues } = require('next/dist/server/font-utils.js');
const { getFallbackMetricsFromFontFile } = require('next/dist/compiled/@next/font/dist/local/get-fallback-metrics-from-font-file.js');
const fontkit = require('next/dist/compiled/@next/font/dist/fontkit').default;

const root = new URL('..', import.meta.url);
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

const layout = readFileSync(new URL('./src/app/layout.tsx', root), 'utf8');
const faces = readFileSync(new URL('./src/fonts/faces.ts', root), 'utf8');
const fallbackCss = readFileSync(new URL('./src/app/font-fallback.css', root), 'utf8');
assert(!layout.includes("from 'next/font/google'"), 'layout does not import next/font/google');
assert(!faces.includes('fonts.googleapis.com') && !faces.includes('fonts.gstatic.com'), 'font calls do not embed Google URLs');
assert(layout.includes('newsreaderFamily') && layout.includes('interTightFamily') && layout.includes('ibmPlexMonoFamily'), 'layout sets the three family variables');
assert(layout.includes('font-fallback.css'), 'layout includes the packaged fallback stylesheet');
assert(faces.includes("display: 'swap'"), 'faces keep font-display swap');

const calls = faces.split('localFont({').length - 1;
const adjustOff = faces.split('adjustFontFallback: false').length - 1;
assert(calls === 15 && adjustOff === 15, 'each subset call turns off next/font/local size-adjust');
assert((faces.split('preload: true').length - 1) === 3, 'only the three latin subset calls preload');
assert((faces.split('preload: false').length - 1) === 12, 'the other twelve subset calls do not preload');

const observations = [
  ['inter-tight.css', 'inter-tight', ['cyrillic-ext', 'cyrillic', 'greek-ext', 'greek', 'vietnamese', 'latin-ext', 'latin']],
  ['ibm-plex-mono.css', 'ibm-plex-mono', ['cyrillic-ext', 'cyrillic', 'vietnamese', 'latin-ext', 'latin']],
  ['newsreader.css', 'newsreader', ['vietnamese', 'latin-ext', 'latin']],
];
const manifest = JSON.parse(readFileSync(new URL('./src/fonts/observations/manifest.json', root), 'utf8'));
assert(manifest.historicalProductionCss === 'not captured', 'manifest does not claim a historical production capture');

const byGoogle = new Map(manifest.files.map((entry) => [entry.googleFile, entry]));
for (const [file, family, expectedOrder] of observations) {
  const css = readFileSync(new URL(`./src/fonts/observations/${file}`, root), 'utf8');
  const downloaded = findFontFilesInCss(css, ['latin']);
  assert(downloaded.length > 0, `${family} observation contains font files`);
  const seenSubsets = [];
  for (const line of css.split('\n')) {
    const subset = /\/\* (.+?) \*\//.exec(line)?.[1];
    if (subset && !seenSubsets.includes(subset)) seenSubsets.push(subset);
  }
  assert(seenSubsets.join(',') === expectedOrder.join(','), `${family} subset order is ${expectedOrder.join(', ')}`);
  const preloaded = downloaded.filter((item) => item.preloadFontFile);
  const notPreloaded = downloaded.filter((item) => !item.preloadFontFile);
  assert(preloaded.length > 0 && notPreloaded.length > 0, `${family} observation preloads latin and still lists other files`);
  for (const item of downloaded) {
    const googleFile = item.googleFontFileUrl.split('/').pop();
    const entry = byGoogle.get(googleFile);
    assert(entry && entry.family === family, `${googleFile} is vendored for ${family}`);
    if (!entry) continue;
    const bytes = readFileSync(new URL(`./src/fonts/${entry.file}`, root));
    const sha = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    assert(sha === entry.sha256 && bytes.subarray(0, 4).toString() === 'wOF2', `${entry.file} matches the observation sha256`);
    const firstUse = css.indexOf(googleFile);
    const comments = [...css.slice(0, firstUse).matchAll(/\/\* ([^*]+) \*\//g)];
    const subset = comments.at(-1)?.[1]?.trim();
    assert(item.preloadFontFile === (subset === 'latin'), `${entry.file} preload follows the latin subset only (${subset})`);
  }
  for (const subset of expectedOrder) {
    const range = new RegExp(`/\\* ${subset} \\*/[\\s\\S]*?unicode-range:\\s*([^;]+);`).exec(css)[1].trim();
    assert(faces.includes(range), `${family} ${subset} unicode-range is declared`);
  }
}

function openFont(file) {
  return fontkit(readFileSync(new URL(`./src/fonts/${file}`, root)));
}
function has(file, codePoint) {
  return openFont(file).hasGlyphForCodePoint(codePoint);
}
const probes = [
  ['inter-tight-latin-variable.woff2', 0x41, true, 'Inter Tight latin has A'],
  ['inter-tight-latin-variable.woff2', 0x0105, false, 'Inter Tight latin lacks aogonek'],
  ['inter-tight-latin-variable.woff2', 0x1ec7, false, 'Inter Tight latin lacks Vietnamese e'],
  ['inter-tight-latin-variable.woff2', 0x044f, false, 'Inter Tight latin lacks Cyrillic ya'],
  ['inter-tight-latin-variable.woff2', 0x03a9, false, 'Inter Tight latin lacks Greek omega'],
  ['inter-tight-latin-ext.woff2', 0x0105, true, 'Inter Tight latin-ext has aogonek'],
  ['inter-tight-vietnamese.woff2', 0x1ec7, true, 'Inter Tight Vietnamese has e'],
  ['inter-tight-cyrillic.woff2', 0x044f, true, 'Inter Tight Cyrillic has ya'],
  ['inter-tight-cyrillic-ext.woff2', 0x0460, true, 'Inter Tight Cyrillic Extended has omega'],
  ['inter-tight-greek.woff2', 0x03a9, true, 'Inter Tight Greek has omega'],
  ['inter-tight-greek-ext.woff2', 0x1f00, true, 'Inter Tight Greek Extended has alpha with psili'],
  ['ibm-plex-mono-latin-400.woff2', 0x41, true, 'IBM Plex Mono latin 400 has A'],
  ['ibm-plex-mono-latin-500.woff2', 0x41, true, 'IBM Plex Mono latin 500 has A'],
  ['ibm-plex-mono-latin-400.woff2', 0x1ec7, false, 'IBM Plex Mono latin lacks Vietnamese e'],
  ['ibm-plex-mono-vietnamese-400.woff2', 0x1ec7, true, 'IBM Plex Mono Vietnamese 400 has e'],
  ['ibm-plex-mono-vietnamese-500.woff2', 0x1ec7, true, 'IBM Plex Mono Vietnamese 500 has e'],
  ['ibm-plex-mono-latin-ext-400.woff2', 0x0105, true, 'IBM Plex Mono latin-ext has aogonek'],
  ['ibm-plex-mono-cyrillic-400.woff2', 0x044f, true, 'IBM Plex Mono Cyrillic has ya'],
  ['ibm-plex-mono-cyrillic-ext-500.woff2', 0x0472, true, 'IBM Plex Mono Cyrillic Extended 500 has big yus'],
  ['ibm-plex-mono-latin-400.woff2', 0x03a9, false, 'IBM Plex Mono has no Greek subset in the observation'],
  ['newsreader-latin-400.woff2', 0x41, true, 'Newsreader latin roman has A'],
  ['newsreader-latin-400-italic.woff2', 0x41, true, 'Newsreader latin italic has A'],
  ['newsreader-latin-400.woff2', 0x1ec7, false, 'Newsreader latin lacks Vietnamese e'],
  ['newsreader-vietnamese-400.woff2', 0x1ec7, true, 'Newsreader Vietnamese roman has e'],
  ['newsreader-vietnamese-400-italic.woff2', 0x1ec7, true, 'Newsreader Vietnamese italic has e'],
  ['newsreader-latin-ext-400.woff2', 0x0105, true, 'Newsreader latin-ext roman has aogonek'],
  ['newsreader-latin-ext-400-italic.woff2', 0x0105, true, 'Newsreader latin-ext italic has aogonek'],
  ['newsreader-latin-400.woff2', 0x044f, false, 'Newsreader observation has no Cyrillic subset'],
];
for (const [file, codePoint, expected, label] of probes) {
  assert(has(file, codePoint) === expected, label);
}

const interPackaged = calculateSizeAdjustValues('Inter Tight');
const ibmPackaged = calculateSizeAdjustValues('IBM Plex Mono');
assert(interPackaged.sizeAdjust === '96.39' && interPackaged.fallbackFont === 'Arial', 'packaged Inter Tight size-adjust is 96.39% Arial');
assert(ibmPackaged.sizeAdjust === '134.59' && ibmPackaged.fallbackFont === 'Arial', 'packaged IBM Plex Mono size-adjust is 134.59% Arial');
let newsreaderPackaged = false;
try {
  calculateSizeAdjustValues('Newsreader');
  newsreaderPackaged = true;
} catch {
  newsreaderPackaged = false;
}
assert(!newsreaderPackaged, 'Newsreader has no packaged size-adjust metrics');

const interLocal = getFallbackMetricsFromFontFile(openFont('inter-tight-latin-variable.woff2'), 'sans-serif');
const ibmLocal = getFallbackMetricsFromFontFile(openFont('ibm-plex-mono-latin-400.woff2'), 'sans-serif');
assert(interLocal.sizeAdjust === '97.21%', 'local Arial measurement of Inter Tight is 97.21%');
assert(ibmLocal.sizeAdjust === '131.49%', 'local Arial measurement of IBM Plex Mono is 131.49%');
assert(interLocal.sizeAdjust !== `${interPackaged.sizeAdjust}%`, 'local and packaged Inter Tight metrics differ');
assert(ibmLocal.sizeAdjust !== `${ibmPackaged.sizeAdjust}%`, 'local and packaged IBM Plex Mono metrics differ');
assert(fallbackCss.includes(`size-adjust: ${interPackaged.sizeAdjust}%;`), 'stylesheet uses the packaged Inter Tight size-adjust');
assert(fallbackCss.includes(`size-adjust: ${ibmPackaged.sizeAdjust}%;`), 'stylesheet uses the packaged IBM Plex Mono size-adjust');
assert(fallbackCss.includes(`ascent-override: ${interPackaged.ascent}%;`), 'stylesheet uses the packaged Inter Tight ascent');
assert(fallbackCss.includes(`ascent-override: ${ibmPackaged.ascent}%;`), 'stylesheet uses the packaged IBM Plex Mono ascent');
assert(!fallbackCss.includes('size-adjust: 97.21%') && !fallbackCss.includes('size-adjust: 131.49%'), 'stylesheet does not apply the local measurements');
assert(!/font-family:\s*["']Newsreader/.test(fallbackCss), 'Newsreader has no size-adjust face');
assert(faces.includes('adjustFontFallback: false') && !faces.includes('Newsreader Fallback'), 'Newsreader stack has no metrics fallback family');

const fontDir = new URL('./src/fonts/', root);
const files = readdirSync(fontDir).filter((name) => name.endsWith('.woff2'));
assert(files.length === 23, 'twenty-three vendored woff2 files');
for (const license of ['OFL-Newsreader.txt', 'OFL-Inter-Tight.txt', 'OFL-IBM-Plex-Mono.txt']) {
  const text = readFileSync(join(fontDir.pathname, license), 'utf8');
  assert(text.includes('SIL Open Font License'), `${license} is the SIL OFL`);
}

const appSource = [
  readFileSync(new URL('./src/app/layout.tsx', root), 'utf8'),
  readFileSync(new URL('./src/app/font-fallback.css', root), 'utf8'),
  faces,
];
assert(appSource.every((source) => !source.includes('fonts.googleapis.com') && !source.includes('fonts.gstatic.com')), 'app font source does not reference Google hosts');

if (process.env.FONT_REQUIRE_BUILD === '1') {
  const cssDir = fileURLToPath(new URL('./.next/static/css/', root));
  let emitted = '';
  for (const name of readdirSync(cssDir)) {
    if (name.endsWith('.css')) emitted += `\n${readFileSync(join(cssDir, name), 'utf8')}`;
  }
  const homepage = readFileSync(fileURLToPath(new URL('./.next/server/app/index.html', root)), 'utf8');
  const preloads = homepage.match(/rel="preload"[^>]*font\/woff2/g) || [];
  assert(preloads.length === 5, 'homepage preloads the five latin files and no other subsets');
  assert(!homepage.includes('fonts.googleapis.com') && !homepage.includes('fonts.gstatic.com'), 'homepage does not call Google');
  const built = emitted.toLowerCase();
  assert(built.includes('unicode-range'), 'built CSS keeps unicode-range');
  assert(built.includes('u+1ea0-1ef9'), 'built CSS keeps the Vietnamese range');
  assert(built.includes('u+0400-045f'), 'built CSS keeps the Cyrillic range');
  assert(built.includes('u+0370-0377'), 'built CSS keeps the Greek range');
  assert(emitted.includes('size-adjust: 96.39%') || emitted.includes('size-adjust:96.39%'), 'built CSS keeps Inter Tight packaged size-adjust');
  assert(emitted.includes('size-adjust: 134.59%') || emitted.includes('size-adjust:134.59%'), 'built CSS keeps IBM Plex Mono packaged size-adjust');
  assert(!emitted.includes('fonts.googleapis.com') && !emitted.includes('fonts.gstatic.com'), 'built CSS does not call Google');
  assert(!emitted.includes('size-adjust: 97.21%') && !emitted.includes('size-adjust:97.21%'), 'built CSS does not apply the local Inter Tight measurement');
}

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('font loader regression passed');
