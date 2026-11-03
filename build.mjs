// Bundles src/ + three.js into ONE self-contained HTML file (dist/fighting-for-life.html)
// that can be opened by double-clicking it. No server needed.
//   node build.mjs           one-off build
//   node build.mjs --watch   rebuild on change

import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'dist/fighting-for-life.html';

// Fonts are embedded as data URIs so the single HTML file works offline (SIL Open Font License, see assets/fonts/).
const FONTS = [
  ['Cormorant Unicase', 700, 'cormorant-unicase-latin-700-normal.woff2'], // logo + screen headings + buttons
  ['Almendra', 400, 'almendra-latin-400-normal.woff2'], // screen body text
  ['Almendra', 700, 'almendra-latin-700-normal.woff2'],
];
const fontCss = () =>
  FONTS.map(([family, weight, file]) => {
    const data = readFileSync(`assets/fonts/${file}`).toString('base64');
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: normal; font-display: block; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join('\n');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !watch,
  sourcemap: false,
  target: 'es2020',
  write: false,
  logLevel: 'info',
};

function emit(result) {
  const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const html = readFileSync('index.template.html', 'utf8').replace('/*BUNDLE*/', () => js).replace('/*FONTS*/', () => fontCss());
  mkdirSync('dist', { recursive: true });
  writeFileSync(OUT, html);
  console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
}

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [{ name: 'emit', setup: (b) => b.onEnd((r) => r.errors.length === 0 && emit(r)) }],
  });
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  emit(await build(options));
}
