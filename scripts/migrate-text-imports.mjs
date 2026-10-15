// DSG-07 / D-19 codemod: move Text and TextInput imports from react-native to the scaled
// primitives in src/ui. Only import lines change. Aliased imports are reported, not rewritten.
// Usage: node scripts/migrate-text-imports.mjs
import fs from 'node:fs';
import path from 'node:path';

const SKIP_FILE = /(__tests__|\.test\.)|ui[\\/]Text(Input)?\.tsx$/;
const RE = /import\s*(type\s*)?\{([^}]*)\}\s*from\s*(['"])react-native\3;?[ \t]*(\r?\n)?/g;

const changed = [];
const aliased = [];
let textCount = 0;
let inputCount = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(f);
      continue;
    }
    if (!/\.tsx?$/.test(e.name) || SKIP_FILE.test(f)) continue;
    migrate(f);
  }
}

function migrate(file) {
  const src = fs.readFileSync(file, 'utf8');
  let needText = false;
  let needInput = false;
  const out = src.replace(RE, (whole, typeOnly, list, _q, nl) => {
    if (typeOnly) return whole;
    const eol = nl || '\n';
    const items = list.split(',').map((s) => s.trim()).filter(Boolean);
    const keep = [];
    for (const it of items) {
      const bare = it.replace(/^type\s+/, '');
      if (/^(Text|TextInput)\s+as\s+/.test(bare)) {
        aliased.push(`${file}: ${it}`);
        keep.push(it);
      } else if (bare === 'Text' && it === bare) needText = true;
      else if (bare === 'TextInput' && it === bare) needInput = true;
      else keep.push(it);
    }
    if (!needText && !needInput && keep.length === items.length) return whole;
    const lines = [];
    if (keep.length) lines.push(`import { ${keep.join(', ')} } from 'react-native';`);
    if (needText) lines.push(`import { Text } from '@/ui/Text';`);
    if (needInput) lines.push(`import { TextInput } from '@/ui/TextInput';`);
    return lines.join(eol) + eol;
  });
  if (out !== src) {
    fs.writeFileSync(file, out);
    changed.push(file);
    if (needText) textCount++;
    if (needInput) inputCount++;
  }
}

walk('src');
console.log(changed.join('\n'));
console.log(`changed ${changed.length} files (Text ${textCount}, TextInput ${inputCount})`);
if (aliased.length) console.log('ALIASED (untouched):\n' + aliased.join('\n'));
