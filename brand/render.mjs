// SVG → PNG rasteriser using headless Chromium (reference SVG fidelity:
// gradients, filters, transparency). Usage:
//   node brand/render.mjs <in.svg> <out.png> <size> [bg]
// size = pixel width (square) or WxH. bg = css colour, or omitted for transparent.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const pw = createRequire(import.meta.url)('playwright'); // repo-local node_modules, no absolute path

const [inSvg, outPng, sizeArg, bg] = process.argv.slice(2);
const [w, h] = String(sizeArg).includes('x') ? sizeArg.split('x').map(Number) : [Number(sizeArg), Number(sizeArg)];
const svg = readFileSync(inSvg, 'utf8');

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const html = `<!doctype html><meta charset="utf8"><style>
  html,body{margin:0;padding:0;width:${w}px;height:${h}px;${bg ? `background:${bg};` : ''}}
  svg{display:block;width:${w}px;height:${h}px}
</style>${svg}`;
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: outPng, omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
await browser.close();
console.log(`rendered ${outPng} (${w}x${h}${bg ? ' on ' + bg : ' transparent'})`);
