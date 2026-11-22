// 08-20: the three household Rules screens are route files under app/(app)/household and are declared in the (app) stack
// outside the Decide gate, so the Rules card on Household home always reaches them.
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..', '..');
const layout = fs.readFileSync(path.join(root, 'app', '(app)', '_layout.tsx'), 'utf8');
const gate = layout.indexOf('<Stack.Protected');

const ROUTES = [
  'household/split-default',
  'household/category-defaults',
  'household/shared-accounts',
  // 08.1-23: How spending is shared
  'household/spending',
  // 08-24: leaving and removing
  'household/leave',
  'household/remove',
] as const;

describe('Household Rules routes', () => {
  it.each(ROUTES)('%s has a route file', (name) => {
    expect(fs.existsSync(path.join(root, 'app', '(app)', `${name}.tsx`))).toBe(true);
  });

  it.each(ROUTES)('%s is declared before the Decide gate', (name) => {
    const at = layout.indexOf(`<Stack.Screen name="${name}" />`);
    expect(at).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(at).toBeLessThan(gate);
  });
});
