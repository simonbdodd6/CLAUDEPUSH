// CoachEasier brand system generator — clean parametric vector geometry.
// Silver "C" ring (top/left) + champagne-gold lower arc, with an integrated
// forward-leaning "E". No raster source; all geometry is computed here so the
// output is a true, editable vector master. Run: node brand/build-logo.mjs
//
// Emits to brand/svg/:
//   coacheasier-mark.svg              icon-only, metallic, transparent (dark or light bg)
//   coacheasier-mark-mono-dark.svg    single-colour dark mark (for light backgrounds)
//   coacheasier-mark-mono-white.svg   single-colour white mark (for dark backgrounds)
//   coacheasier-logo-horizontal.svg   mark + wordmark + tagline, landscape lockup
//   coacheasier-logo-master.svg       stacked master lockup (mark above wordmark)
//   ...-on-light variants             identical geometry, light-tuned metal stops
//   coacheasier-favicon.svg           flat-colour simplified mark (crisp at 16–48px)
//   coacheasier-appicon.svg           dark rounded-square app tile
//   coacheasier-appicon-maskable.svg  full-bleed dark square, mark in safe zone
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'svg');
mkdirSync(OUT, { recursive: true });

const CX = 512, CY = 512;

// ---- geometry params (tuned by rendering + viewing) ------------------------
const RO = 374;   // ring outer radius
const RI = 302;   // ring inner radius
const SILVER = [137, 300];  // silver arc: lower-left → over top → upper-right
const GOLD   = [52, 133];   // gold arc: lower-right → across bottom → lower-left

const rad = d => (d * Math.PI) / 180;
const P = (r, d) => [ +(CX + r * Math.cos(rad(d))).toFixed(2), +(CY + r * Math.sin(rad(d))).toFixed(2) ];

// annular sector (band) between RI..RO from a0..a1 degrees
function band(a0, a1, step = 1.5) {
  const outer = [], inner = [];
  for (let a = a0; a <= a1 + 0.0001; a += step) { outer.push(P(RO, a)); inner.push(P(RI, a)); }
  inner.reverse();
  return 'M' + [...outer, ...inner].map(p => p.join(',')).join(' L') + ' Z';
}

const silverBand = band(SILVER[0], SILVER[1]);
const goldBand   = band(GOLD[0], GOLD[1]);

// E — floating top arm + one continuous "Ɛ" body (spine joins middle+bottom).
// Bars lean gently forward with an angled nose cut — quiet motion, not esports.
const E = { xL: 384, spineR: 460, rise: 18, nose: 28 };
const T = { yTop: 388, yBot: 480, xR: 806 };
const armTop = `M${E.xL},${T.yTop} L${T.xR + E.nose},${T.yTop - E.rise} `
             + `L${T.xR - 10},${T.yBot - E.rise} L${E.xL},${T.yBot} Z`;
const M = { yTop: 524, yBot: 616, xR: 782 };
const B = { yTop: 660, yBot: 756, xR: 828 };
const body =
    `M${E.xL},${M.yTop} `
  + `L${M.xR + E.nose},${M.yTop - E.rise} L${M.xR - 10},${M.yBot - E.rise} `
  + `L${E.spineR},${M.yBot} L${E.spineR},${B.yTop} `
  + `L${B.xR + E.nose},${B.yTop - E.rise} L${B.xR - 10},${B.yBot - E.rise} `
  + `L${E.xL},${B.yBot} Z`;

// ---- metal palettes --------------------------------------------------------
// One global light direction (top-left → bottom-right) via userSpaceOnUse, so
// the ring and the E shade as a single machined object.
function metalDefs({ variant }) {
  // dark-bg metals are brighter; light-bg metals are deepened for contrast on white
  const s = variant === 'light'
    ? ['#E7E9EC', '#AEB4BB', '#7C838B', '#D5D8DC', '#6F767E', '#9AA0A7', '#585F67']
    : ['#FDFDFE', '#D3D7DC', '#A6ACB3', '#F2F4F6', '#9AA0A8', '#C9CED3', '#82888F'];
  const g = variant === 'light'
    ? ['#E9D9AE', '#C6A25C', '#A37E38', '#D9BE85', '#96742F', '#7A5D26']
    : ['#F7EBC8', '#DCBB74', '#BE9346', '#EAD299', '#B08A44', '#8C6A2E'];
  return `
  <linearGradient id="silver" gradientUnits="userSpaceOnUse" x1="180" y1="120" x2="850" y2="940">
    <stop offset="0"    stop-color="${s[0]}"/>
    <stop offset="0.22" stop-color="${s[1]}"/>
    <stop offset="0.40" stop-color="${s[2]}"/>
    <stop offset="0.52" stop-color="${s[3]}"/>
    <stop offset="0.68" stop-color="${s[4]}"/>
    <stop offset="0.85" stop-color="${s[5]}"/>
    <stop offset="1"    stop-color="${s[6]}"/>
  </linearGradient>
  <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="240" y1="700" x2="900" y2="980">
    <stop offset="0"    stop-color="${g[0]}"/>
    <stop offset="0.28" stop-color="${g[1]}"/>
    <stop offset="0.5"  stop-color="${g[2]}"/>
    <stop offset="0.66" stop-color="${g[3]}"/>
    <stop offset="0.84" stop-color="${g[4]}"/>
    <stop offset="1"    stop-color="${g[5]}"/>
  </linearGradient>`;
}

// The mark's inner content (mask + paths), reusable inside any canvas.
// maskId must be unique per document.
function markContent({ variant = 'dark', mono = null, maskId = 'ecut', transform = '' } = {}) {
  const fills = mono
    ? { silver: mono, gold: mono, e: mono }
    : { silver: 'url(#silver)', gold: 'url(#gold)', e: 'url(#silver)' };
  return `
  <mask id="${maskId}">
    <rect x="-2048" y="-2048" width="8192" height="8192" fill="#fff"/>
    <path d="${armTop}" fill="#000" stroke="#000" stroke-width="30" stroke-linejoin="round"/>
    <path d="${body}"   fill="#000" stroke="#000" stroke-width="30" stroke-linejoin="round"/>
  </mask>
  <g${transform ? ` transform="${transform}"` : ''}>
    <g mask="url(#${maskId})">
      <path d="${silverBand}" fill="${fills.silver}"/>
      <path d="${goldBand}"   fill="${fills.gold}"/>
    </g>
    <path d="${armTop}" fill="${fills.e}"/>
    <path d="${body}"   fill="${fills.e}"/>
  </g>`;
}

function svgDoc({ w, h, inner, defs = '', title = 'CoachEasier' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
<defs>${defs}</defs>${inner}
</svg>`;
}

// ---- wordmark + tagline ----------------------------------------------------
// Live text with a wide system stack (rendered to paths-equivalent fidelity in
// PNG exports). NOTE for print/agency use: outline to paths with a licensed
// font before external distribution — flagged in the brand README.
const WORD_STACK = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
function goldTextDef({ id, y0, y1, variant }) {
  const g = variant === 'light'
    ? ['#C6A25C', '#A37E38', '#8A6A2C']
    : ['#EFD79E', '#CFA85C', '#A9853E'];
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">
    <stop offset="0" stop-color="${g[0]}"/><stop offset="0.55" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/>
  </linearGradient>`;
}
function wordmark({ x, y, size, fill, goldId, anchor = 'start' }) {
  return `<text x="${x}" y="${y}" font-family="${WORD_STACK}" font-weight="800" font-style="italic"
    font-size="${size}" letter-spacing="${size * 0.02}" fill="${fill}" text-anchor="${anchor}">COACH<tspan fill="url(#${goldId})">EASIER</tspan></text>`;
}
function wordmarkMono({ x, y, size, fill, anchor = 'start' }) {
  return `<text x="${x}" y="${y}" font-family="${WORD_STACK}" font-weight="800" font-style="italic"
    font-size="${size}" letter-spacing="${size * 0.02}" fill="${fill}" text-anchor="${anchor}">COACHEASIER</text>`;
}
function tagline({ x, y, size, fill, goldFill, anchor = 'start' }) {
  return `<text x="${x}" y="${y}" font-family="${WORD_STACK}" font-weight="600"
    font-size="${size}" letter-spacing="${size * 0.34}" fill="${fill}" text-anchor="${anchor}">IT’S IN <tspan fill="${goldFill}">OUR</tspan> GAME.</text>`;
}

// ---- 1+2. icon-only marks (metallic, dark-bg + light-bg tunings) -----------
writeFileSync(join(OUT, 'coacheasier-mark.svg'),
  svgDoc({ w: 1024, h: 1024, defs: metalDefs({ variant: 'dark' }), inner: markContent({ maskId: 'mk1' }) }));
writeFileSync(join(OUT, 'coacheasier-mark-on-light.svg'),
  svgDoc({ w: 1024, h: 1024, defs: metalDefs({ variant: 'light' }), inner: markContent({ maskId: 'mk2' }) }));

// ---- 3. monochrome marks ---------------------------------------------------
writeFileSync(join(OUT, 'coacheasier-mark-mono-dark.svg'),
  svgDoc({ w: 1024, h: 1024, inner: markContent({ mono: '#12161C', maskId: 'mk3' }) }));
writeFileSync(join(OUT, 'coacheasier-mark-mono-white.svg'),
  svgDoc({ w: 1024, h: 1024, inner: markContent({ mono: '#FFFFFF', maskId: 'mk4' }) }));

// ---- 4. horizontal lockup --------------------------------------------------
function horizontal({ variant }) {
  const inkMain = variant === 'light' ? '#14181E' : '#F4F6F8';
  const inkTag  = variant === 'light' ? '#4A5058' : '#B7BDC5';
  const goldTag = variant === 'light' ? '#A37E38' : '#D9B972';
  // canvas 2600x800; mark scaled 0.66, centred vertically
  return svgDoc({ w: 2600, h: 800, defs: metalDefs({ variant }) + goldTextDef({ id: 'gt', y0: 290, y1: 480, variant }),
    inner: markContent({ variant, maskId: 'mh', transform: 'translate(70,62) scale(0.66)' })
      + wordmark({ x: 820, y: 470, size: 196, fill: inkMain, goldId: 'gt' })
      + tagline({ x: 836, y: 606, size: 58, fill: inkTag, goldFill: goldTag }),
    title: 'CoachEasier — It’s in our game.' });
}
writeFileSync(join(OUT, 'coacheasier-logo-horizontal.svg'), horizontal({ variant: 'dark' }));
writeFileSync(join(OUT, 'coacheasier-logo-horizontal-on-light.svg'), horizontal({ variant: 'light' }));

// ---- 5. stacked master lockup ---------------------------------------------
function master({ variant }) {
  const inkMain = variant === 'light' ? '#14181E' : '#F4F6F8';
  const inkTag  = variant === 'light' ? '#4A5058' : '#B7BDC5';
  const goldTag = variant === 'light' ? '#A37E38' : '#D9B972';
  // canvas 1600x1600: mark 0.82 centred, wordmark + tagline beneath
  return svgDoc({ w: 1600, h: 1600, defs: metalDefs({ variant }) + goldTextDef({ id: 'gt', y0: 1035, y1: 1180, variant }),
    inner: markContent({ variant, maskId: 'mm', transform: 'translate(380,60) scale(0.82)' })
      + wordmark({ x: 800, y: 1170, size: 138, fill: inkMain, goldId: 'gt', anchor: 'middle' })
      + tagline({ x: 800, y: 1288, size: 44, fill: inkTag, goldFill: goldTag, anchor: 'middle' }),
    title: 'CoachEasier — It’s in our game.' });
}
writeFileSync(join(OUT, 'coacheasier-logo-master.svg'), master({ variant: 'dark' }));
writeFileSync(join(OUT, 'coacheasier-logo-master-on-light.svg'), master({ variant: 'light' }));

// ---- 6. favicon (flat colour — crisp at 16px, no gradients) ----------------
const faviconDefs = ''; // flat fills
const faviconInner = `
  <mask id="fv"><rect width="1024" height="1024" fill="#fff"/>
    <path d="${armTop}" fill="#000" stroke="#000" stroke-width="44" stroke-linejoin="round"/>
    <path d="${body}"   fill="#000" stroke="#000" stroke-width="44" stroke-linejoin="round"/>
  </mask>
  <g mask="url(#fv)">
    <path d="${silverBand}" fill="#C7CCD2"/>
    <path d="${goldBand}"   fill="#C79A47"/>
  </g>
  <path d="${armTop}" fill="#DDE1E5"/>
  <path d="${body}"   fill="#DDE1E5"/>`;
writeFileSync(join(OUT, 'coacheasier-favicon.svg'),
  svgDoc({ w: 1024, h: 1024, defs: faviconDefs, inner: faviconInner }));

// ---- 7. app icons ----------------------------------------------------------
// Rounded-square dark tile, mark at 72% (standard) / 58% (maskable safe zone).
function appIcon({ maskable = false }) {
  const scale = maskable ? 0.58 : 0.72;
  const off = (1024 - 1024 * scale) / 2;
  const rx = maskable ? 0 : 232;
  return svgDoc({ w: 1024, h: 1024, defs: metalDefs({ variant: 'dark' }), inner: `
  <rect width="1024" height="1024" rx="${rx}" fill="#0A0D12"/>
  <rect width="1024" height="1024" rx="${rx}" fill="url(#silver)" opacity="0.05"/>
  ${markContent({ maskId: maskable ? 'am' : 'ai', transform: `translate(${off},${off}) scale(${scale})` })}` });
}
writeFileSync(join(OUT, 'coacheasier-appicon.svg'), appIcon({ maskable: false }));
writeFileSync(join(OUT, 'coacheasier-appicon-maskable.svg'), appIcon({ maskable: true }));

console.log('brand system SVGs written to brand/svg/');
