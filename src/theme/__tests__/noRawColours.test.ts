import * as fs from 'fs';
import * as path from 'path';

/**
 * DSG-02: the §2 token set is the complete palette. No hex/rgb colour literal may exist
 * outside src/theme/tokens.ts, src/theme/accents.ts, or src/features/auth/brand/ (the
 * D-12 Apple/Google provider-brand-mark exception, recorded in
 * docs/design/token-exceptions.md). Adding a new colour therefore needs a deliberate
 * edit in two places: the token file, and the ALLOWED_HEXES list below.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCAN_DIRS = ['src', 'app'];

const ALLOWED_FILES = new Set([path.join('src', 'theme', 'tokens.ts'), path.join('src', 'theme', 'accents.ts')]);
const ALLOWED_DIR = path.join('src', 'features', 'auth', 'brand');

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('DSG-02: no raw colour literals outside the token set', () => {
  it('finds no hex/rgb colour literal outside tokens.ts, accents.ts or src/features/auth/brand/', () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      const dirPath = path.join(ROOT, dir);
      if (!fs.existsSync(dirPath)) continue;

      for (const file of listSourceFiles(dirPath)) {
        const rel = path.relative(ROOT, file);
        if (ALLOWED_FILES.has(rel)) continue;
        if (rel.startsWith(ALLOWED_DIR)) continue;

        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (COLOUR_LITERAL.test(line)) {
            violations.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }

    expect(violations).toEqual([]);
  });

  // Copied verbatim from BUILD-PROMPT.md §2 (colour tokens, accent options) plus
  // Component.COL / Component.TINT (FincWin United.dc.html lines 3217-3218) and
  // Component.HHCOL (line 3216, all already covered by COL). This is the whole palette —
  // adding a colour here is a deliberate, reviewable act, not an accident.
  const ALLOWED_HEXES = new Set([
    // surface / canvas / shell / ink family
    '#FFFFFF',
    '#FBFAF7',
    '#E7E4DC',
    '#14150F',
    '#6E6A5E',
    '#767161',
    '#5C5A50',
    '#A8A79C',
    '#BFBEB4',
    '#C6C2B6',
    // accent (default + 3 selectable) and its tints
    '#1B4D3E',
    '#1F3A5F',
    '#7A4B2A',
    '#3E5C6B',
    '#EAF1EC',
    '#E9F0EB',
    '#F4F7F4',
    // danger and its tints
    '#B4472A',
    '#F6EAE6',
    '#F3E6E1',
    '#F6EAE5',
    // warn
    '#8A5A1B',
    '#7E6020',
    // line
    '#EDEAE1',
    '#E2DED2',
    '#E5E2D7',
    '#D9D5C9',
    // fill
    '#F1EFE8',
    '#F2EFE7',
    '#F5F3ED',
    '#F4F2EB',
    '#FAF8F3',
    '#F6F4EE',
    // Component.COL / Component.TINT category colours not already covered above
    '#5A6472',
    '#2F6E68',
    '#6E4A63',
    '#E6EFEE',
    '#EAEEF1',
    '#F0EAEF',
    '#F4EFE3',
    '#ECEEF1',
  ]);

  it('keeps every hex used in tokens.ts and accents.ts inside the deliberate allow-list', () => {
    const found = new Set<string>();

    for (const relFile of ['tokens.ts', 'accents.ts']) {
      const text = fs.readFileSync(path.join(ROOT, 'src', 'theme', relFile), 'utf8');
      for (const match of text.matchAll(/#[0-9A-Fa-f]{3,8}/g)) {
        found.add(match[0].toUpperCase());
      }
    }

    const notAllowed = [...found].filter((hex) => !ALLOWED_HEXES.has(hex));
    expect(notAllowed).toEqual([]);
  });
});
