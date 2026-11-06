// 05.4 CMP-F03 / APP-19 (05.4-38, D-124): Decide analytics carry no purchase size. The catalogue is type-only, so this reads
// catalogue.ts and checks every Decide event's declared property names. DECIDE_EVENTS must name every Decide event there is.
import { readFileSync } from 'fs';
import { join } from 'path';
import { DECIDE_EVENTS, isDecideEvent } from '../catalogue';

const SOURCE = readFileSync(join(__dirname, '..', 'catalogue.ts'), 'utf8');
const BODY = SOURCE.slice(SOURCE.indexOf('export type EventCatalogue = {'), SOURCE.indexOf('export type EventName'));

/** event name -> its declared property names, from lines like `name: { a: ...; b: ... };` or `name: Record<string, never>;`. */
function events(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /^\s{2}([a-z_]+): (Record<string, never>|\{([\s\S]*?)\});/gm;
  for (let m = re.exec(BODY); m !== null; m = re.exec(BODY)) {
    const props = m[3] === undefined ? [] : [...m[3].matchAll(/([a-z_]+)\??:/g)].map((p) => p[1]!);
    out.set(m[1]!, props);
  }
  return out;
}

const SIZE = /price|amount|band|range|total|cost|size|value|caveat/i;

describe('05.4-38 analytics catalogue (CMP-F03, APP-19)', () => {
  const all = events();

  it('reads every event in the catalogue', () => {
    expect(all.size).toBeGreaterThan(30);
    for (const e of DECIDE_EVENTS) expect(all.has(e)).toBe(true);
  });

  it('lists every Decide event: the decide, check and decision events and nothing else', () => {
    const decideLike = [...all.keys()].filter((e) => /^(decide_|check_|quick_check|decision_|first_read)/.test(e)).sort();
    expect([...DECIDE_EVENTS].sort()).toEqual(decideLike);
    expect(isDecideEvent('decide_answer_shown')).toBe(true);
    expect(isDecideEvent('app_opened')).toBe(false);
  });

  it('no Decide event declares a price, amount, band, range, total, cost, size or caveat property', () => {
    const bad = DECIDE_EVENTS.flatMap((e) => (all.get(e) ?? []).filter((p) => SIZE.test(p)).map((p) => `${e}.${p}`));
    expect(bad).toEqual([]);
    expect(all.get('decide_answer_shown')).toEqual(['code', 'variant']);
  });

  it('the scan bites: a band property would be caught', () => {
    expect(SIZE.test('band')).toBe(true);
    expect(SIZE.test('price_band')).toBe(true);
  });
});
