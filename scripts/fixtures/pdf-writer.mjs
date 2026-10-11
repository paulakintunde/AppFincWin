// Test-fixture tooling only. Never imported by app or Edge Function code.
//
// Minimal PDF 1.4 writer: Helvetica text at absolute positions, raw vector
// shapes, optional Standard Security Handler R2 (40-bit RC4) encryption so the
// password-protected fixture can be produced with no third-party dependency.
import { createHash } from 'node:crypto';

const UPPER = {
  A: 667, B: 667, C: 722, D: 722, E: 611, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
const LOWER = {
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};
const OTHER = {
  ' ': 278, ',': 278, '.': 278, '-': 333, '(': 333, ')': 333, '/': 278, ':': 278,
  '@': 1015, '£': 556,
};

export const HELVETICA_WIDTHS = {
  ...UPPER,
  ...LOWER,
  ...OTHER,
  ...Object.fromEntries('0123456789'.split('').map((d) => [d, 556])),
};

export function textWidth(str, size) {
  let sum = 0;
  for (const ch of str) sum += HELVETICA_WIDTHS[ch] ?? 556;
  return (sum / 1000) * size;
}

const FONT_SIZE = 9;

function escapePdfString(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (code > 126 || code < 32) out += '\\' + code.toString(8).padStart(3, '0');
    else out += ch;
  }
  return out;
}

const num = (n) => {
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, '') || '0';
};

function pageContent(page) {
  const lines = [];
  for (const shape of page.shapes ?? []) lines.push(shape);
  for (const t of page.texts ?? []) {
    const x = t.align === 'right' ? t.x - textWidth(t.str, FONT_SIZE) : t.x;
    lines.push(
      `BT /F1 ${FONT_SIZE} Tf 1 0 0 1 ${num(x)} ${num(t.y)} Tm (${escapePdfString(t.str)}) Tj ET`,
    );
  }
  return Buffer.from(lines.join('\n') + '\n', 'latin1');
}

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let a = 0;
  let b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255;
    b = (b + s[a]) & 255;
    [s[a], s[b]] = [s[b], s[a]];
    out[k] = data[k] ^ s[(s[a] + s[b]) & 255];
  }
  return out;
}

const md5 = (...bufs) => createHash('md5').update(Buffer.concat(bufs)).digest();

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const padPassword = (pw) => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);

function buildEncryption(encrypt, id) {
  const padU = padPassword(encrypt.userPassword);
  const padO = padPassword(encrypt.ownerPassword);
  const O = rc4(md5(padO).subarray(0, 5), padU);
  const P = Buffer.from([0xd4, 0xff, 0xff, 0xff]); // -44 little-endian
  const key = md5(padU, O, P, id).subarray(0, 5);
  const U = rc4(key, PAD);
  return { O, U, key };
}

function objectKey(key, objNum) {
  const objBytes = Buffer.from([objNum & 255, (objNum >> 8) & 255, (objNum >> 16) & 255, 0, 0]);
  return md5(key, objBytes).subarray(0, 10);
}

/**
 * @param pages  PageSpec[]  { texts: { str, x, y, align? }[], shapes?: string[] }
 * @param opts   { name?: string, encrypt?: { userPassword, ownerPassword } | null, fillerBytes?: number }
 * @returns Buffer
 */
export function writePdf(pages, opts = {}) {
  const { name = 'fixture', encrypt = null, fillerBytes = 0 } = opts;
  const id = md5(Buffer.from(name, 'latin1'));
  const enc = encrypt ? buildEncryption(encrypt, id) : null;

  const parts = [];
  let offset = 0;
  const offsets = [];
  const push = (buf) => {
    const b = typeof buf === 'string' ? Buffer.from(buf, 'latin1') : buf;
    parts.push(b);
    offset += b.length;
  };
  const beginObj = (n) => {
    offsets[n] = offset;
    push(`${n} 0 obj\n`);
  };

  push(Buffer.concat([Buffer.from('%PDF-1.4\n%', 'latin1'), Buffer.from([0xe2, 0xe3, 0xcf, 0xd3]), Buffer.from('\n')]));

  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ');
  beginObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  beginObj(2);
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);
  beginObj(3);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');

  let nextObj = 4;
  pages.forEach((page) => {
    const pageObj = nextObj++;
    const contentObj = nextObj++;
    beginObj(pageObj);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`,
    );
    let content = pageContent(page);
    if (enc) content = rc4(objectKey(enc.key, contentObj), content);
    beginObj(contentObj);
    push(`<< /Length ${content.length} >>\nstream\n`);
    push(content);
    push('\nendstream\nendobj\n');
  });

  if (fillerBytes > 0) {
    const unit = Buffer.from('0123456789ABCDEF\n', 'latin1');
    const filler = Buffer.alloc(fillerBytes);
    for (let i = 0; i < fillerBytes; i++) filler[i] = unit[i % unit.length];
    const fillerObj = nextObj++;
    beginObj(fillerObj);
    push(`<< /Length ${filler.length} >>\nstream\n`);
    push(filler);
    push('\nendstream\nendobj\n');
  }

  let encryptObj = null;
  if (enc) {
    encryptObj = nextObj++;
    beginObj(encryptObj);
    push(
      `<< /Filter /Standard /V 1 /R 2 /O <${enc.O.toString('hex')}> /U <${enc.U.toString('hex')}> /P -44 >>\nendobj\n`,
    );
  }

  const size = nextObj;
  const xrefOffset = offset;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  const idHex = id.toString('hex');
  push(
    `trailer\n<< /Size ${size} /Root 1 0 R${encryptObj ? ` /Encrypt ${encryptObj} 0 R` : ''} /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.concat(parts);
}
