// src/xlsx-read.js — minimal, dependency-free .xlsx reader (RC4.10B).
//
// An .xlsx file is a ZIP of XML parts. This reads the first worksheet and the
// shared-string table and returns a plain array-of-arrays, exactly like a CSV.
//
// SAFETY: cell FORMULAS (<f>) are never read and never evaluated — only the
// cached value (<v>) or inline string. Nothing in a spreadsheet can execute,
// fetch, or reference anything outside the file. External links, macros and
// DDE are simply parts we never open.
//
// The raw-deflate implementation is injected so the same module works in the
// browser (DecompressionStream) and in Node (zlib.inflateRawSync).

const te = new TextDecoder('utf-8');

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/** Locate the ZIP end-of-central-directory record and list its entries. */
function readZipEntries(bytes) {
  let eocd = -1;
  const start = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= start; i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx file (no ZIP directory found)');
  const count = u16(bytes, eocd + 10);
  let offset = u32(bytes, eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (u32(bytes, offset) !== 0x02014b50) break;
    const method = u16(bytes, offset + 10);
    const compressedSize = u32(bytes, offset + 20);
    const nameLen = u16(bytes, offset + 28);
    const extraLen = u16(bytes, offset + 30);
    const commentLen = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    const name = te.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(bytes, entry, inflateRaw) {
  const lo = entry.localOffset;
  if (u32(bytes, lo) !== 0x04034b50) throw new Error('Corrupt .xlsx entry');
  const nameLen = u16(bytes, lo + 26);
  const extraLen = u16(bytes, lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const data = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return te.decode(data);          // stored
  if (entry.method !== 8) throw new Error('Unsupported .xlsx compression');
  return te.decode(await inflateRaw(data));
}

/** Default raw-inflate for browsers. Node callers inject zlib instead. */
export async function browserInflateRaw(data) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot read .xlsx files — use CSV instead');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const decodeEntities = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/g, '&');

/** Shared strings table — concatenates all <t> runs per entry. */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(m[1]))) text += decodeEntities(t[1]);
    out.push(text);
  }
  return out;
}

const colToIndex = ref => {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0] || 'A';
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Parse a worksheet into rows of primitive values (string | number). */
function parseSheet(xml, shared) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1] || '';
      const inner = cellMatch[2] || '';
      const ref = attrs.match(/r="([A-Z]+\d+)"/i)?.[1] || '';
      const type = attrs.match(/t="([^"]+)"/)?.[1] || 'n';
      const index = ref ? colToIndex(ref) : cells.length;

      // Deliberately ignore <f> (the formula) — only the cached <v> is read,
      // so nothing is ever evaluated during import.
      let value = '';
      if (type === 'inlineStr') {
        let text = ''; const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let t;
        while ((t = tRe.exec(inner))) text += decodeEntities(t[1]);
        value = text;
      } else {
        const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        if (v === undefined) value = '';
        else if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'str' || type === 'e') value = decodeEntities(v);
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else { const num = Number(v); value = Number.isFinite(num) ? num : decodeEntities(v); }
      }
      while (cells.length < index) cells.push('');
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows.filter(r => r.some(c => String(c ?? '').trim() !== ''));
}

/**
 * Read the first worksheet of an .xlsx file.
 * @param {Uint8Array} bytes  raw file contents
 * @param {(d:Uint8Array)=>Promise<Uint8Array>} inflateRaw
 * @returns {Promise<Array<Array<string|number>>>}
 */
export async function parseXlsx(bytes, inflateRaw = browserInflateRaw) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 22 || u32(data, 0) !== 0x04034b50) {
    throw new Error('Not a valid .xlsx file');
  }
  const entries = readZipEntries(data);
  const sheetEntry =
    entries.find(e => /^xl\/worksheets\/sheet1\.xml$/i.test(e.name)) ||
    entries.find(e => /^xl\/worksheets\/.*\.xml$/i.test(e.name));
  if (!sheetEntry) throw new Error('No worksheet found in this .xlsx file');
  const sharedEntry = entries.find(e => /^xl\/sharedStrings\.xml$/i.test(e.name));
  const sharedXml = sharedEntry ? await readEntry(data, sharedEntry, inflateRaw) : '';
  const sheetXml = await readEntry(data, sheetEntry, inflateRaw);
  return parseSheet(sheetXml, parseSharedStrings(sharedXml));
}
