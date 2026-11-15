#!/usr/bin/env node
// 06.2-08 (D-03, D-04, D-15, D-19, D-25, D-29): the five milestone Lottie files, generated from the board drawings.
//
// Reads scripts/icons/icons.generated.json (plan 01: the board SVGs, copied, never redrawn) and writes
// assets/lottie/<milestone>.json. Each animation is the still icon in motion, so its last frame is the still Glyph:
//   - 'back' layer (the board's <g opacity=".45">): opacity 0 -> 45 over frames 0-18, ease-out.
//   - 'front' layer: stroke elements draw once with a trim path 0 -> 100 over frames 27-51 (L07 .lf-draw: .4s, .45s delay,
//     ease-out); filled elements fade 0 -> 100 over frames 27-45.
//   - safetyNetLocked: the padlock shackle (the group holding `M8 10.4V7.6...`) is already drawn, as on the board, and closes:
//     translate y -3.2 -> 0 over frames 30-60 (L07 .lf-shackle: .5s, .5s delay, cubic-bezier(.2,.8,.3,1)). The body stays.
//   - 60 fps, 72 frames (1.2 s, DURATION.icon), then held. Plays once (AnimatedIcon sets loop={false}).
// Colours are a black placeholder: the app sets the real colour at runtime with colorFilters on the 'back' and 'front'
// layer names (keypaths), so the theme is never baked in.
//
// Geometry: SVG path d -> svgpath (abs, unarc, unshort) -> absolute cubic beziers -> Lottie vertices with tangents
// relative to each vertex. rect -> rc (rx -> roundness), circle -> el. Stroke width, caps and joins are copied.
// Unknown tags or attributes fail the run, so a board change cannot slip through silently.
//
//   node scripts/icons/build-lottie.mjs           write the five files
//   node scripts/icons/build-lottie.mjs --check   CI: fail if any committed file differs from a fresh build

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import svgpath from 'svgpath';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICONS = 'scripts/icons/icons.generated.json';
const OUT_DIR = 'assets/lottie';

/** D-19: only milestones whose feature exists on main. Milestone -> the still icon it ends on. */
export const MILESTONES = {
  goalReached: 'stateFits',
  debtCleared: 'stateFits',
  importDone: 'import',
  firstEntry: 'firstEntry',
  safetyNetLocked: 'stateSafetyNet',
};

const FR = 60;
const OP = 72;
const SIZE = 24;
const BACK_OPACITY = 45;
const SHACKLE_D = 'M8 10.4V7.6';
const SHACKLE_LIFT = -3.2;

/** Lottie keyframe easing: `o` is the first control point (out of this key), `i` the second (into the next key). */
const EASE_OUT = { o: { x: [0], y: [0] }, i: { x: [0.58], y: [1] } };
const BOARD_CURVE = { o: { x: [0.2], y: [0.8] }, i: { x: [0.3], y: [1] } };

const BLACK = [0, 0, 0, 1];

const r4 = (n) => {
  const v = Math.round(n * 10000) / 10000;
  return Object.is(v, -0) ? 0 : v;
};
const num = (s, what) => {
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`build-lottie: ${what} is not a number: ${s}`);
  return v;
};
const fixed = (k) => ({ a: 0, k });
const animated = (from, to, t0, t1, ease) => ({
  a: 1,
  k: [
    { t: t0, s: Array.isArray(from) ? from : [from], ...ease },
    { t: t1, s: Array.isArray(to) ? to : [to] },
  ],
});

const groupTransform = (p = fixed([0, 0])) => ({
  ty: 'tr',
  p,
  a: fixed([0, 0]),
  s: fixed([100, 100]),
  r: fixed(0),
  o: fixed(100),
  sk: fixed(0),
  sa: fixed(0),
  nm: 'Transform',
});

/** SVG path d -> one Lottie `sh` per subpath. */
export function pathShapes(d) {
  const segs = svgpath(d).abs().unarc().unshort().segments;
  const subpaths = [];
  let cur = null;
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  const lineTo = (x, y) => {
    cur.v.push([x, y]);
    cur.i.push([0, 0]);
    cur.o.push([0, 0]);
    px = x;
    py = y;
  };
  const cubicTo = (x1, y1, x2, y2, x, y) => {
    const last = cur.v.length - 1;
    cur.o[last] = [x1 - cur.v[last][0], y1 - cur.v[last][1]];
    cur.v.push([x, y]);
    cur.i.push([x2 - x, y2 - y]);
    cur.o.push([0, 0]);
    px = x;
    py = y;
  };
  const finish = () => {
    if (cur && cur.v.length > 0) subpaths.push(cur);
    cur = null;
  };
  for (const seg of segs) {
    const [cmd, ...a] = seg;
    if (cmd !== 'M' && cur === null) {
      // A command after Z starts a new subpath at the last subpath's start (SVG rule).
      cur = { v: [[sx, sy]], i: [[0, 0]], o: [[0, 0]], c: false };
      px = sx;
      py = sy;
    }
    switch (cmd) {
      case 'M':
        finish();
        cur = { v: [[a[0], a[1]]], i: [[0, 0]], o: [[0, 0]], c: false };
        px = sx = a[0];
        py = sy = a[1];
        break;
      case 'L':
        lineTo(a[0], a[1]);
        break;
      case 'H':
        lineTo(a[0], py);
        break;
      case 'V':
        lineTo(px, a[0]);
        break;
      case 'C':
        cubicTo(a[0], a[1], a[2], a[3], a[4], a[5]);
        break;
      case 'Q': {
        // Quadratic -> cubic: control points 2/3 of the way to the quadratic control point.
        const [qx, qy, x, y] = a;
        cubicTo(px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
        break;
      }
      case 'Z': {
        cur.c = true;
        const n = cur.v.length;
        // A closing point that sits on the start merges into it (its in-tangent moves to the start vertex).
        if (n > 1 && Math.abs(cur.v[n - 1][0] - cur.v[0][0]) < 1e-6 && Math.abs(cur.v[n - 1][1] - cur.v[0][1]) < 1e-6) {
          cur.i[0] = cur.i[n - 1];
          cur.v.pop();
          cur.i.pop();
          cur.o.pop();
        }
        px = sx;
        py = sy;
        finish();
        break;
      }
      default:
        throw new Error(`build-lottie: unsupported path command ${cmd} in ${d}`);
    }
  }
  finish();
  return subpaths.map((sp, idx) => ({
    ty: 'sh',
    nm: `Path ${idx + 1}`,
    ks: fixed({
      i: sp.i.map(([x, y]) => [r4(x), r4(y)]),
      o: sp.o.map(([x, y]) => [r4(x), r4(y)]),
      v: sp.v.map(([x, y]) => [r4(x), r4(y)]),
      c: sp.c,
    }),
  }));
}

const KNOWN_ATTRS = {
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
};
const PAINT_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule'];

function geometry(node) {
  const { tag, attrs } = node;
  for (const key of Object.keys(attrs)) {
    if (!KNOWN_ATTRS[tag]?.includes(key) && !PAINT_ATTRS.includes(key)) {
      throw new Error(`build-lottie: unsupported attribute ${key} on <${tag}>`);
    }
  }
  if (tag === 'path') return pathShapes(attrs.d);
  if (tag === 'rect') {
    const x = num(attrs.x ?? 0, 'rect x');
    const y = num(attrs.y ?? 0, 'rect y');
    const w = num(attrs.width, 'rect width');
    const h = num(attrs.height, 'rect height');
    const rx = num(attrs.rx ?? attrs.ry ?? 0, 'rect rx');
    if (attrs.ry !== undefined && attrs.rx !== undefined && attrs.ry !== attrs.rx) {
      throw new Error('build-lottie: rect with different rx and ry is not supported');
    }
    return [{ ty: 'rc', nm: 'Rect', d: 1, s: fixed([r4(w), r4(h)]), p: fixed([r4(x + w / 2), r4(y + h / 2)]), r: fixed(r4(rx)) }];
  }
  if (tag === 'circle') {
    const r = num(attrs.r, 'circle r');
    return [{ ty: 'el', nm: 'Ellipse', d: 1, s: fixed([r4(2 * r), r4(2 * r)]), p: fixed([r4(num(attrs.cx ?? 0, 'cx')), r4(num(attrs.cy ?? 0, 'cy'))]) }];
  }
  throw new Error(`build-lottie: unsupported tag <${tag}>`);
}

const LINECAP = { butt: 1, round: 2, square: 3 };
const LINEJOIN = { miter: 1, round: 2, bevel: 3 };

/**
 * One drawing element -> a Lottie group. `layer` is 'back' or 'front'; `drawn` is false for an element that is already
 * on screen at frame 0 (the shackle, which closes rather than draws).
 */
function elementGroup(node, layer, idx, drawn) {
  const { tag, attrs } = node;
  const items = [...geometry(node)];
  const stroke = attrs.stroke !== undefined && attrs.stroke !== 'none';
  const fill = attrs.fill !== 'none';
  if (attrs.fill === undefined) throw new Error(`build-lottie: <${tag}> has no fill attribute (SVG would fill it black)`);
  if (stroke) {
    if (layer === 'front' && drawn) {
      items.push({ ty: 'tm', nm: 'Draw', s: fixed(0), e: animated(0, 100, 27, 51, EASE_OUT), o: fixed(0), m: 1 });
    }
    const lc = LINECAP[attrs['stroke-linecap'] ?? 'butt'];
    const lj = LINEJOIN[attrs['stroke-linejoin'] ?? 'miter'];
    if (!lc || !lj) throw new Error(`build-lottie: unsupported cap/join on <${tag}>`);
    items.push({ ty: 'st', nm: 'Stroke', c: fixed(BLACK), o: fixed(100), w: fixed(r4(num(attrs['stroke-width'] ?? 1, 'stroke-width'))), lc, lj, ml: 4 });
  }
  if (fill) {
    const opacity = layer === 'front' && drawn ? animated(0, 100, 27, 45, EASE_OUT) : fixed(100);
    items.push({ ty: 'fl', nm: 'Fill', c: fixed(BLACK), o: opacity, r: attrs['fill-rule'] === 'evenodd' ? 2 : 1 });
  }
  items.push(groupTransform());
  return { ty: 'gr', nm: `${layer} ${idx + 1}`, it: items };
}

const isShackle = (node) => node.tag === 'g' && node.children?.some((c) => c.tag === 'path' && c.attrs.d?.startsWith(SHACKLE_D));

function nodeGroup(node, layer, idx) {
  if (node.tag !== 'g') return elementGroup(node, layer, idx, true);
  if (Object.keys(node.attrs).length > 0) throw new Error('build-lottie: <g> attributes are not supported');
  const shackle = layer === 'front' && isShackle(node);
  const children = node.children.map((c, j) => (c.tag === 'g' ? nodeGroup(c, layer, j) : elementGroup(c, layer, j, !shackle)));
  const p = shackle ? animated([0, SHACKLE_LIFT], [0, 0], 30, 60, BOARD_CURVE) : fixed([0, 0]);
  return { ty: 'gr', nm: shackle ? 'shackle' : `${layer} group ${idx + 1}`, it: [...children, groupTransform(p)] };
}

function shapeLayer(name, ind, nodes, opacity) {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: name,
    sr: 1,
    ks: { o: opacity, r: fixed(0), p: fixed([0, 0, 0]), a: fixed([0, 0, 0]), s: fixed([100, 100, 100]) },
    ao: 0,
    shapes: nodes.map((n, i) => nodeGroup(n, name, i)),
    ip: 0,
    op: OP,
    st: 0,
    bm: 0,
  };
}

export function buildMilestone(milestone, icon) {
  if (icon.viewBox !== `0 0 ${SIZE} ${SIZE}`) throw new Error(`build-lottie: ${icon.name} viewBox ${icon.viewBox}`);
  if (milestone === 'safetyNetLocked' && !icon.front.some(isShackle)) {
    throw new Error('build-lottie: safetyNetLocked has no shackle group in the board drawing');
  }
  return {
    v: '5.7.0',
    fr: FR,
    ip: 0,
    op: OP,
    w: SIZE,
    h: SIZE,
    nm: milestone,
    ddd: 0,
    assets: [],
    // Lottie draws the first layer on top: front over back, as in the SVG.
    layers: [
      shapeLayer('front', 1, icon.front, fixed(100)),
      shapeLayer('back', 2, icon.back, animated(0, BACK_OPACITY, 0, 18, EASE_OUT)),
    ],
  };
}

export function buildAll() {
  const icons = JSON.parse(readFileSync(join(ROOT, ICONS), 'utf8'));
  const out = {};
  for (const [milestone, still] of Object.entries(MILESTONES)) {
    const icon = icons.find((i) => i.name === still);
    if (!icon) throw new Error(`build-lottie: no icon named ${still} in ${ICONS}`);
    out[milestone] = `${JSON.stringify(buildMilestone(milestone, icon), null, 2)}\n`;
  }
  return out;
}

function main(argv) {
  const files = buildAll();
  if (argv.includes('--check')) {
    const drift = [];
    for (const [milestone, text] of Object.entries(files)) {
      const file = join(ROOT, OUT_DIR, `${milestone}.json`);
      const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
      if (current !== text) drift.push(`${OUT_DIR}/${milestone}.json`);
    }
    if (drift.length > 0) {
      console.error(`check:icons: milestone Lottie files differ from the board drawings. Run \`npm run icons:lottie\`.\n  ${drift.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`check:icons: ${Object.keys(files).length} milestone Lottie files match the board drawings`);
    return;
  }
  mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
  for (const [milestone, text] of Object.entries(files)) writeFileSync(join(ROOT, OUT_DIR, `${milestone}.json`), text);
  console.log(`icons:lottie: wrote ${Object.keys(files).length} files to ${OUT_DIR}`);
}

const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) main(process.argv.slice(2));
