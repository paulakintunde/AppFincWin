import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('react-native-purchases seam', () => {
  it('is pinned to exactly 10.16.0', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['react-native-purchases']).toBe('10.16.0');
    expect(pkg.dependencies['react-native-purchases-ui']).toBeUndefined();
  });

  it('is imported by one file only', () => {
    const importers = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'app'))]
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /from\s+['"]react-native-purchases['"]|require\(['"]react-native-purchases['"]\)/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f).split(path.sep).join('/'));
    expect(importers).toEqual(['src/features/plans/store/purchasesClient.ts']);
  });
});
