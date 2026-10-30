// 05.3-09: part A of decide.v3.ui (D-10 order, question captions, plural pairs, D-11 no 9999, D-18 stored-only wording, D-20 row).
import en from '../locales/en';
import { QUESTION_LIBRARY } from '../../engine/decide/v3/judge/presetQuestions';

const ui = en.decide.v3.ui as unknown as Record<string, Record<string, unknown>>;

function leaves(node: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

const AREAS = ['home', 'notReady', 'check', 'band', 'layers', 'question', 'answer', 'factRow', 'confidence', 'ask'];
const partA = leaves(
  Object.fromEntries(AREAS.map((a) => [a, ui[a]])),
  ''
);

describe('decide.v3.ui part A copy', () => {
  it('mounts every area', () => {
    for (const a of AREAS) expect(ui[a]).toBeDefined();
  });

  it('D-10: six purpose presets in order', () => {
    expect(Object.keys(ui.layers!.purpose as object)).toEqual(['invest_in_me', 'for_work', 'necessity', 'nice_to_have', 'treat', 'luxury']);
  });

  it('every QUESTION_LIBRARY id has a caption', () => {
    for (const spec of QUESTION_LIBRARY) {
      expect(typeof ui.question![spec.id]).toBe('string');
    }
  });

  it('each _one key has an _other sibling', () => {
    for (const { path } of partA) {
      if (path.endsWith('_one')) expect(partA.some((l) => l.path === path.replace(/_one$/, '_other'))).toBe(true);
    }
  });

  it('no leaf contains 9999 (D-11)', () => {
    for (const l of partA) expect(l.value).not.toContain('9999');
  });

  it('D-18: value, major-asset and very-large copy never claims to change the answer', () => {
    const keys = ['valueEyebrow', 'earns', 'useFor', 'alternatives', 'majorEyebrow', 'depositFrom', 'keep', 'after', 'newBills', 'stopBills', 'storedNote', 'veryLargeEyebrow', 'sources', 'professional'];
    for (const k of keys) {
      const v = ui.layers![k] as string;
      expect(typeof v).toBe('string');
      expect(v).not.toMatch(/answer|changes the|counts/i);
    }
    expect(ui.layers!.storedNote).toMatch(/records/);
  });

  it('D-20: the Something changed row resolves', () => {
    expect(ui.home!.somethingChanged).toBe('Something changed?');
    expect(typeof ui.home!.somethingChangedA11y).toBe('string');
  });

  it('D-26: each month card row carries a detail line', () => {
    const h = ui.home as Record<string, string>;
    expect(h.typicalDetail_one).toBe('From 1 month of records');
    expect(h.typicalDetail_other).toBe('From {{count}} months of records');
    expect(h.typicalDetailNone).toBe('Shows once a month is fully recorded');
    expect(h.unspentDetail).toBe('Confirmed {{date}}');
    expect(h.unspentDetailNone).toBe('Add the money you have now');
    expect(h.emergencyDetail).toBe('Kept apart from what you spend');
    expect(h.emergencyDetailUnlinked).toBe('Pick the account that holds it');
    expect(h.emergencyDetailNone).toBe('Add a fund to keep apart');
    expect(h.figureTypicalA11y).toBe('Typical month, {{amount}}. {{detail}}. Opens how it was worked out.');
    expect(h.figureUnspentA11y).toBe('Unspent money, {{amount}}. {{detail}}. Opens unspent money.');
    expect(h.figureEmergencyA11y).toBe('Emergency fund, {{amount}}. {{detail}}. Opens the emergency fund.');
  });
});
