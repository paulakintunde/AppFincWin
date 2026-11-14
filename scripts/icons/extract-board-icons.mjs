#!/usr/bin/env node
// 06.2-01 (D-03, D-29): FincWin's own icon set, copied from the exported board SVGs, never redrawn.
//
// Reads .planning/phases/06.2-app-life/boards/*.dc.html (design data only; parsed at dev time, never shipped or read at runtime)
// and writes:
//   scripts/icons/icons.generated.json   every icon, sorted by name
//   src/ui/icons/iconData.ts             the same data as a typed ICONS record (the app imports this)
//
// Sources:
//   1. L07 (the icon set): every SVG after the 3 size samples, named from the label beside it via LABELS (section aware).
//   2. L01-L06 and L08: every 24-viewBox SVG whose geometry is not already in L07, named via EXTRAS (keyed by the first 40
//      characters of its geometry key). The 5 tab glyphs (22 viewBox, src/shell/tabBar/TabGlyphs.tsx) and charts are skipped.
// Unknown labels, missing names and unknown geometry fail the run, so a board change cannot slip through silently.
//
// Each icon is { name, viewBox, back, front }: `back` is the content of the board's `<g opacity=".45">`, `front` the rest.
// Attribute strings are copied exactly as written; hex colours become the sentinel 'C' (the Glyph colour), `fill="none"` stays.
// class / style / aria / pathLength (animation-only) attributes are dropped. No eval; regex parsing of machine-written HTML.
//
//   node scripts/icons/extract-board-icons.mjs           write both files
//   node scripts/icons/extract-board-icons.mjs --check   CI: fail if either file differs from the boards

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOARDS = '.planning/phases/06.2-app-life/boards';
const JSON_OUT = 'scripts/icons/icons.generated.json';
const TS_OUT = 'src/ui/icons/iconData.ts';
const VIEWBOX = '0 0 24 24';
const L07 = 'L07-IconSet.dc.html';
const SIZE_SAMPLES = 3;

/** L07 section heading prefix -> label -> IconName. */
const LABELS = {
  Categories: {
    Housing: 'housing',
    Utilities: 'utilities',
    Groceries: 'groceries',
    Transport: 'transport',
    Insurance: 'insurance',
    Health: 'health',
    Subscriptions: 'subscriptions',
    Debt: 'debt',
    Savings: 'savings',
    Business: 'business',
    Tax: 'tax',
    Dining: 'dining',
    Income: 'income',
    Settlement: 'settlement',
    Transfer: 'transfer',
  },
  'Account types': {
    Current: 'acctCurrent',
    Savings: 'acctSavings',
    'Credit card': 'acctCard',
    Cash: 'acctCash',
    Loan: 'acctLoan',
    Investment: 'acctInvestment',
    Pension: 'acctPension',
    Other: 'acctOther',
  },
  'Actions and settings': {
    Add: 'add',
    'Pay bills': 'payBills',
    Import: 'import',
    'Check a buy': 'checkBuy',
    Profile: 'profile',
    'Face ID': 'faceId',
    'PIN lock': 'pinLock',
    Accent: 'accent',
    Font: 'font',
    Alerts: 'alerts',
    Haptics: 'haptics',
    Privacy: 'privacy',
    Connected: 'connected',
    'Saved offline': 'savedOffline',
    Download: 'download',
    'Sign out': 'signOut',
    Delete: 'delete',
    History: 'history',
    Categories: 'categories',
    Calendar: 'calendar',
    Accounts: 'accounts',
    Household: 'household',
    Search: 'search',
    View: 'view',
    'First entry': 'firstEntry',
    Undo: 'undo',
  },
  'State shapes': {
    'Paid, fits': 'stateFits',
    Tight: 'stateTight',
    'Over cap': 'stateOverCap',
    'Due, not yet': 'stateDue',
    Short: 'stateShort',
    'Safety net': 'stateSafetyNet',
    Up: 'stateUp',
    Down: 'stateDown',
  },
};

/** Glyphs used on other boards but not drawn in L07: first 40 characters of the geometry key -> IconName (word beside it). */
const EXTRAS = {
  'path M9.4 5.4 16 12l-6.6 6.6': 'arrowRight', // row chevron (L01, L02 ...)
  'path M6 6l12 12M18 6 6 18': 'close', // day sheet close (L03)
  'path M12 2.6 21.4 12 12 21.4 2.6 12Z|pat': 'checkIt', // L08 "Check it" button
  'rect 3 13 5 7.6 2|rect 16 13 5 7.6 2|pat': 'headphones', // L08 item "Headphones"
  'rect 4.4 4.6 15.2 11 2|rect 2 17.4 20 2.': 'laptop', // L08 item "Laptop"
  'path M4.6 7.4h3l1.6-2.4h5.6l1.6 2.4h3a1.': 'camera', // L08 item "Studio camera body"
  'circle 12 12 9.5|path M5.6 12.6h2.6l1.8-': 'somethingChanged', // L08 "Something changed?"
};

const GEOMETRY = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'transform'];
const DROPPED = new Set(['class', 'style', 'aria-hidden', 'pathLength']);
const HEX = /^#[0-9A-Fa-f]{3,8}$/;

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function fail(message) {
  const err = new Error(message);
  err.iconsFailure = true;
  throw err;
}

/** Parse the inside of one <svg> into a node tree. */
function parseNodes(body) {
  const root = [];
  const stack = [root];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)\b([^>]*?)\/?>/g)) {
    const [, closing, tag, rawAttrs] = m;
    if (!['g', 'path', 'rect', 'circle'].includes(tag)) fail(`unsupported SVG element <${tag}>`);
    if (closing) {
      if (tag === 'g') stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      if (DROPPED.has(a[1])) continue;
      attrs[a[1]] = (a[1] === 'fill' || a[1] === 'stroke') && HEX.test(a[2]) ? 'C' : a[2];
    }
    const node = { tag, attrs };
    stack[stack.length - 1].push(node);
    if (tag === 'g') {
      node.children = [];
      stack.push(node.children);
    }
  }
  return root;
}

/** One board SVG (text after `<svg`) -> { viewBox, back, front, end } where end is the index just past `</svg>`. */
function parseSvg(chunk) {
  const close = chunk.indexOf('</svg>');
  const open = chunk.indexOf('>');
  const viewBox = (chunk.slice(0, open).match(/viewBox="([^"]*)"/) ?? [])[1];
  const end = close + '</svg>'.length;
  if (viewBox !== VIEWBOX) return { viewBox, back: [], front: [], end }; // tab glyphs (22 viewBox), charts: not icons
  const nodes = parseNodes(chunk.slice(open + 1, close));
  let back = [];
  let front = nodes;
  const first = nodes[0];
  if (first?.tag === 'g' && first.attrs.opacity === '.45' && Object.keys(first.attrs).length === 1) {
    back = first.children;
    front = nodes.slice(1);
  }
  return { viewBox, back, front, end };
}

function flatten(nodes) {
  return nodes.flatMap((n) =>
    n.tag === 'g' ? flatten(n.children) : [[n.tag, ...GEOMETRY.filter((k) => k in n.attrs).map((k) => n.attrs[k])].join(' ')],
  );
}

/** Colour-free geometry key: back then front, one entry per drawn element. */
const geometryKey = (icon) => [...flatten(icon.back), ...flatten(icon.front)].join('|');
const sameDrawing = (a, b) => JSON.stringify([a.back, a.front]) === JSON.stringify([b.back, b.front]);

function fromL07() {
  const html = read(`${BOARDS}/${L07}`);
  const headings = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => ({ at: m.index, text: m[1] }));
  const chunks = html.split('<svg');
  const icons = [];
  let offset = chunks[0].length;
  chunks.slice(1).forEach((chunk, i) => {
    const at = offset;
    offset += '<svg'.length + chunk.length;
    if (i < SIZE_SAMPLES) return;
    const svg = parseSvg(chunk);
    if (svg.viewBox !== VIEWBOX) fail(`L07 icon ${i} has viewBox ${svg.viewBox}`);
    const label = (chunk.slice(svg.end).match(/^<\/span><span[^>]*>([^<]*)<\/span>/) ?? [])[1];
    if (label === undefined) fail(`L07 icon ${i} has no label beside it`);
    const heading = headings.filter((h) => h.at < at).at(-1)?.text ?? '';
    const section = Object.keys(LABELS).find((s) => heading.startsWith(s));
    if (section === undefined) fail(`L07 label "${label}" is under unknown heading "${heading}"`);
    const name = LABELS[section][label];
    if (name === undefined) fail(`L07 label "${label}" (${section}) is not in the LABELS table`);
    icons.push({ name, viewBox: VIEWBOX, back: svg.back, front: svg.front });
  });
  const found = new Set(icons.map((i) => i.name));
  for (const section of Object.values(LABELS)) {
    for (const name of Object.values(section)) if (!found.has(name)) fail(`L07 icon "${name}" not found on the board`);
  }
  return icons;
}

function fromOtherBoards(known) {
  const extras = new Map();
  const files = readdirSync(join(ROOT, BOARDS))
    .filter((f) => f.endsWith('.dc.html') && f !== L07)
    .sort();
  for (const f of files) {
    for (const chunk of read(`${BOARDS}/${f}`).split('<svg').slice(1)) {
      const svg = parseSvg(chunk);
      if (svg.viewBox !== VIEWBOX) continue; // tab glyphs (22 viewBox) and charts
      if (known.some((k) => sameDrawing(k, svg))) continue;
      const key = geometryKey(svg);
      const name = EXTRAS[key.slice(0, 40)];
      if (name === undefined) fail(`${f}: unknown glyph, add it to EXTRAS: '${key.slice(0, 40)}' (${key})`);
      const prior = extras.get(name);
      if (prior !== undefined && !sameDrawing(prior, svg)) fail(`${f}: two different drawings share the name "${name}"`);
      extras.set(name, { name, viewBox: VIEWBOX, back: svg.back, front: svg.front });
    }
  }
  for (const name of Object.values(EXTRAS)) if (!extras.has(name)) fail(`extra glyph "${name}" not found on any board`);
  return [...extras.values()];
}

export function extract() {
  const l07 = fromL07();
  // Same drawing under two names (Savings category and Savings account) is fine; the same name twice is not.
  const icons = [...l07, ...fromOtherBoards(l07)];
  const names = new Set();
  for (const i of icons) {
    if (names.has(i.name)) fail(`icon name "${i.name}" used twice`);
    names.add(i.name);
  }
  return icons.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const nodeText = (n) => JSON.stringify(n).replace(/"([a-zA-Z]+)":/g, '$1:').replace(/"/g, "'");
const listText = (nodes) => (nodes.length === 0 ? '[]' : `[\n${nodes.map((n) => `      ${nodeText(n)},`).join('\n')}\n    ]`);

export function render(icons) {
  const json = `${JSON.stringify(icons, null, 2)}\n`;
  const entries = icons
    .map((i) => `  ${i.name}: {\n    viewBox: '${i.viewBox}',\n    back: ${listText(i.back)},\n    front: ${listText(i.front)},\n  },`)
    .join('\n');
  const ts = `// GENERATED by scripts/icons/extract-board-icons.mjs from .planning/phases/06.2-app-life/boards (D-29). Do not edit by hand.
// Run \`npm run icons:extract\` after a board changes; \`npm run check:icons\` (CI) fails on drift.
// 'C' is the colour sentinel: Glyph swaps it for its \`color\` prop. \`back\` is drawn at 45% opacity (D-03).

export type IconNode = {
  readonly tag: 'path' | 'rect' | 'circle' | 'g';
  readonly attrs: { readonly [attr: string]: string };
  readonly children?: readonly IconNode[];
};

export type IconDef = {
  readonly viewBox: '0 0 24 24';
  readonly back: readonly IconNode[];
  readonly front: readonly IconNode[];
};

export const ICONS = {
${entries}
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
`;
  return { json, ts };
}

function main(argv) {
  let out;
  try {
    out = render(extract());
  } catch (err) {
    if (!err.iconsFailure) throw err;
    console.error(`icons: ${err.message}`);
    return 1;
  }
  if (argv.includes('--check')) {
    const norm = (s) => s.replace(/\r\n/g, '\n');
    let onDisk;
    try {
      onDisk = { json: norm(read(JSON_OUT)), ts: norm(read(TS_OUT)) };
    } catch {
      onDisk = null;
    }
    if (onDisk === null || onDisk.json !== out.json || onDisk.ts !== out.ts) {
      console.error('icons drift: run npm run icons:extract');
      return 1;
    }
    console.log(`check:icons: ${JSON.parse(out.json).length} icons match the boards`);
    return 0;
  }
  writeFileSync(join(ROOT, JSON_OUT), out.json);
  writeFileSync(join(ROOT, TS_OUT), out.ts);
  console.log(`icons:extract: wrote ${JSON.parse(out.json).length} icons`);
  return 0;
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(fileURLToPath(import.meta.url), resolve(process.argv[1]))) {
  process.exitCode = main(process.argv.slice(2));
}
