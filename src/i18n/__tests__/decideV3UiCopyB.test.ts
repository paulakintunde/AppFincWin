// 05.3-09b: part B of decide.v3.ui (record, plan, instead, worked, help, refine, refund, decisions, summary).
import { partB } from '../locales/decideV3Ui/partB';

interface Leaf {
  path: string;
  value: string;
}

function collectLeaves(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeaves(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

const leaves = collectLeaves(partB, 'decide.v3.ui');

const REFINE_KINDS = [
  'pay',
  'pay_stopped',
  'everyday',
  'everyday_override_expiring',
  'new_regular',
  'saving_bucket',
  'unspent',
  'changing_income',
  'steady_above_income',
  'series_drift',
  'card_not_paid_in_full',
  'under_logged_month',
] as const;

describe('decide.v3.ui part B copy', () => {
  it.each(REFINE_KINDS)('refine has kicker, title and body for %s', (kind) => {
    const card = partB.refine.kind[kind];
    expect(card.kicker.length).toBeGreaterThan(0);
    expect(card.title.length).toBeGreaterThan(0);
    expect(card.body.length).toBeGreaterThan(0);
  });

  it('refine covers exactly the 12 kinds', () => {
    expect(Object.keys(partB.refine.kind).sort()).toEqual([...REFINE_KINDS].sort());
  });

  it('every _one key has an _other sibling', () => {
    const paths = new Set(leaves.map((l) => l.path));
    const missing = leaves.filter((l) => l.path.endsWith('_one') && !paths.has(l.path.replace(/_one$/, '_other')));
    expect(missing.map((l) => l.path)).toEqual([]);
  });

  it('no leaf carries the 9999 sentinel or banned wording', () => {
    const bad = leaves.filter((l) => l.value.includes('9999') || /\boffer|\bfree\b|\bbetter\b|you should/i.test(l.value));
    expect(bad.map((l) => l.path)).toEqual([]);
  });

  it('resolves the summary button and the refund chip', () => {
    expect(partB.summary.checkPurchase).toBe('Check a purchase');
    expect(partB.refund.chip).toContain('{{payee}}');
  });
});
