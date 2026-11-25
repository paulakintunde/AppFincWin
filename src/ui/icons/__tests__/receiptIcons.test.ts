// 10.1-03 (RCP-07): the receipt, file and scan glyphs come from the L07 board through the extractor.
import { ICONS } from '../iconData';

describe('receipt, file and scan icons', () => {
  it.each(['receipt', 'file', 'scan'] as const)('%s is in the generated set with drawn geometry', (name) => {
    const icon = ICONS[name];
    expect(icon.viewBox).toBe('0 0 24 24');
    expect(icon.front.length).toBeGreaterThan(0);
    expect(icon.back.length).toBeGreaterThan(0);
  });
});
