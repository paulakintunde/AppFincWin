// D-32 / T-08-61: a member's name reaches the screen only through the resolver (useMemberLabel.ts). No other feature or
// shell file may read the member name columns or the profile's full name. The allowlist is the resolver itself and the
// files that show the signed-in user's OWN profile name (the You screen, the header avatar, the sign-in remembered
// accounts list); they never name another member. src/db/* is outside the walk (it holds the column lists).
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const ALLOWED = new Set([
  'features/household/useMemberLabel.ts',
  'features/auth/rememberedAccounts.ts',
  'features/you/useProfile.ts',
  'features/you/YouScreen.tsx',
  'shell/header/AvatarButton.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('member names come only from the resolver (D-32)', () => {
  const files = [...walk(path.join(ROOT, 'features')), ...walk(path.join(ROOT, 'shell'))];

  it('walks real files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no file outside the allowlist reads display_name or full_name', () => {
    const offenders = files
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /display_name|full_name/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every allowlisted file still exists', () => {
    for (const rel of ALLOWED) expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
  });
});
