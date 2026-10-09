import { UNDO_LABEL_KEYS } from '../../engine/undo/types';
import en from '../locales/en';
import { undoLabelText } from '../undoLabel';

function lookup(path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

function exists(key: string): boolean {
  return (
    typeof lookup(key) === 'string' ||
    (typeof lookup(`${key}_one`) === 'string' && typeof lookup(`${key}_other`) === 'string')
  );
}

function collect(node: unknown, out: string[]): void {
  if (typeof node === 'string') out.push(node);
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => collect(v, out));
}

describe('undo label keys', () => {
  it.each([...UNDO_LABEL_KEYS])('%s resolves to an existing en string', (key) => {
    const withName = undoLabelText(key, { n: 2, name: 'X' });
    expect(exists(withName.key)).toBe(true);
    const noName = undoLabelText(key, { n: 2 });
    expect(exists(noName.key)).toBe(true);
  });
});

const SUBTREES = [
  'activity.view',
  'activity.sort',
  'activity.group',
  'activity.balance',
  'activity.calendar',
  'activity.offer',
  'activity.review',
  'activity.tag',
  'activity.swipe',
  'activity.detail',
  'activity.clone',
  'activity.months',
  'activity.more',
  'activity.empty',
  'record.sheet.keypad',
  'record.sheet.toggle',
  'record.sheet.note',
  'importCsv.paste',
  'importCsv.refund',
  'categories.usage',
  'categories.cap',
  'samples',
  'you.weekStart',
  'you.homeCurrency',
  'accounts.detail',
  'accounts.remove',
];

describe('Phase 2.2 copy voice', () => {
  it.each(SUBTREES)('%s exists and is declarative', (path) => {
    const node = lookup(path);
    expect(node).toBeDefined();
    const values: string[] = [];
    collect(node, values);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).not.toMatch(/\b(advice|advise|recommend|recommendation|should)\b/i);
      expect(v).not.toMatch(/device/i);
    }
  });
});
