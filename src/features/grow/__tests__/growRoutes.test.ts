// 06-16: every Grow detail route is a file under app/(app)/grow and is declared in the (app) stack outside the Decide gate.
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..', '..');
const layout = fs.readFileSync(path.join(root, 'app', '(app)', '_layout.tsx'), 'utf8');
const gate = layout.indexOf('<Stack.Protected');

const ROUTES = ['grow/goal/[id]', 'grow/debt/[id]', 'grow/holding/[id]', 'grow/safety-net', 'grow/lines'] as const;

describe('Grow routes', () => {
  it.each(ROUTES)('%s has a route file', (name) => {
    expect(fs.existsSync(path.join(root, 'app', '(app)', `${name}.tsx`))).toBe(true);
  });

  it.each(ROUTES)('%s is declared before the Decide gate, so it does not depend on DECIDE_OPEN', (name) => {
    const at = layout.indexOf(`<Stack.Screen name="${name}" />`);
    expect(at).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(at).toBeLessThan(gate);
  });
});
