/** ARC-21: the scorer reads no Decide or month module; only inputs.ts does. */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('health score purity (ARC-21)', () => {
  it.each(['score.ts', 'types.ts'])('%s imports nothing from decide/ or month/', (file) => {
    const text = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(text).not.toContain("from '../decide");
    expect(text).not.toContain("from '../month");
  });
});
