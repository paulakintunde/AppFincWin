import { unspentSum, type AccountUse, type Evaluation, type UnspentSum } from '@/engine/decide/v3';
import { demoSource, sofaInputs } from '../../__tests__/helpers/demoScenario';
import { buildV3Inputs } from '../../snapshot/v3/buildV3Inputs';
import { computeV3 } from '../../snapshot/v3/computeV3';
import { v3s } from '../../snapshot/v3/__tests__/v3Fixtures';
import { daysSince, toStoredAnchor, unspentStateOf, unspentSumLines } from '../unspentView';

const TODAY = '2026-10-03';
const source = () => demoSource(TODAY);
const everyday = (): Record<string, AccountUse> => Object.fromEntries(source().accounts.map((a) => [a.id, { kind: 'everyday' } as AccountUse]));

function build(anchor: { amount: number; at: string } | null, uses?: Record<string, AccountUse>) {
  const settings = v3s(anchor ? { unspent_anchor: anchor.amount, unspent_anchor_at: anchor.at } : {});
  const evaluation = computeV3(source(), settings, sofaInputs, uses);
  const inputs = buildV3Inputs(source(), settings);
  // the stated uses reach the engine through computeV3's own inputs; the sum must read the same ones
  const sum = unspentSum({ ...inputs, accounts: inputs.accounts?.map((a) => ({ ...a, use: uses?.[a.id] ?? a.use })) }, evaluation.month);
  return { evaluation, sum };
}
const net = (lines: ReturnType<typeof unspentSumLines>['lines']): number => lines.reduce((t, l) => t + l.sign * l.amount, 0);

describe('unspentSumLines (T-05.2-28-01: the lines are the engine sum)', () => {
  it('nets to the engine suggested figure with every account set to everyday', () => {
    const { evaluation, sum } = build(null, everyday());
    const view = unspentSumLines(sum);
    expect(net(view.lines)).toBe(view.total);
    expect(view.total).toBe(evaluation.funds.suggested);
    expect(view.lines[0]!.key).toBe('balance');
    expect(view.lines.map((l) => l.key)).toEqual(expect.arrayContaining(['billsDue', 'everydayLeft']));
  });

  it('counts accounts whose use is not set, and nets all the same', () => {
    const { evaluation, sum } = build(null);
    const view = unspentSumLines(sum);
    expect(view.unstatedAccounts).toBeGreaterThan(0);
    expect(net(view.lines)).toBe(evaluation.funds.suggested);
  });

  it('a mixed account adds the set-aside line only when it is above 0', () => {
    const uses = everyday();
    const first = Object.keys(uses)[0]!;
    uses[first] = { kind: 'mixed', extraSetAside: 10_000 } as AccountUse;
    const { evaluation, sum } = build(null, uses);
    const view = unspentSumLines(sum);
    expect(view.hasMixed).toBe(true);
    expect(view.lines.find((l) => l.key === 'mixedSetAside')?.amount).toBeGreaterThan(0);
    expect(net(view.lines)).toBe(evaluation.funds.suggested);
    const plain = unspentSumLines(build(null, everyday()).sum);
    expect(plain.hasMixed).toBe(false);
    expect(plain.lines.some((l) => l.key === 'mixedSetAside')).toBe(false);
  });

  const hand = (over: { [K in keyof UnspentSum]?: number | boolean }): UnspentSum =>
    ({ gross: 500_000, mixedSetAside: 0, envelopes: 0, emergency: 0, bills: 100_000, everyday: 50_000, suggested: 350_000, heldBack: 0, total: 350_000, unstatedAccounts: 0, unplacedEnvelopes: 0, hasMixed: false, ...over }) as unknown as UnspentSum;

  it('omits envelopes, emergency, set-aside and held-back at 0, and keeps bills and everyday', () => {
    expect(unspentSumLines(hand({})).lines.map((l) => l.key)).toEqual(['balance', 'billsDue', 'everydayLeft']);
  });

  it('shows every line when each is above 0, held-back last, and nets to the total', () => {
    const view = unspentSumLines(hand({ mixedSetAside: 20_000, envelopes: 30_000, emergency: 40_000, heldBack: 10_000, suggested: 260_000, total: 250_000 }));
    expect(view.lines.map((l) => l.key)).toEqual(['balance', 'mixedSetAside', 'billsDue', 'everydayLeft', 'envelopes', 'emergency', 'heldBack']);
    expect(net(view.lines)).toBe(250_000);
  });

  it('a negative total stays negative', () => {
    const view = unspentSumLines(hand({ gross: 10_000, suggested: -140_000, total: -140_000 }));
    expect(view.total).toBe(-140_000);
    expect(net(view.lines)).toBe(-140_000);
  });
});

describe('unspentStateOf', () => {
  it('no anchor: not confirmed, carrying the sum', () => {
    const { evaluation, sum } = build(null, everyday());
    expect(unspentStateOf(evaluation, sum, TODAY)).toEqual({ kind: 'notConfirmed', sum: sum.total });
  });

  it('an anchor equal to the sum, today: fresh', () => {
    const { sum } = build(null, everyday());
    const { evaluation, sum: again } = build({ amount: sum.suggested, at: TODAY }, everyday());
    expect(unspentStateOf(evaluation, again, TODAY)).toEqual({ kind: 'fresh', value: sum.total, anchor: sum.suggested, anchorAt: TODAY });
  });

  it('an anchor far from the sum: drifted, with the rolled figure and the sum', () => {
    const { sum } = build(null, everyday());
    const { evaluation, sum: again } = build({ amount: sum.suggested + 5_000_000, at: TODAY }, everyday());
    const view = unspentStateOf(evaluation, again, TODAY);
    expect(view.kind).toBe('drifted');
    if (view.kind === 'drifted') {
      expect(view.sum).toBe(again.total);
      expect(view.rolled).toBe(evaluation.funds.unspent!.value);
      expect(view.anchorAt).toBe(TODAY);
    }
  });

  it('the engine stale flag gives stale with the days since; drifted wins when both are set', () => {
    const { sum } = build(null, everyday());
    const { evaluation, sum: again } = build({ amount: sum.suggested, at: '2026-08-20' }, everyday());
    const state = evaluation.funds.unspent!;
    const stale = { ...evaluation, funds: { ...evaluation.funds, unspent: { ...state, stale: true, drifted: false } } } as Evaluation;
    const view = unspentStateOf(stale, again, TODAY);
    expect(view).toMatchObject({ kind: 'stale', days: 44, anchorAt: '2026-08-20' });
    const both = { ...evaluation, funds: { ...evaluation.funds, unspent: { ...state, stale: true, drifted: true } } } as Evaluation;
    expect(unspentStateOf(both, again, TODAY).kind).toBe('drifted');
  });

  it('held-back money comes off every displayed figure, and toStoredAnchor puts it back', () => {
    const { sum } = build(null, everyday());
    const held = { ...sum, heldBack: 10_000, total: sum.suggested - 10_000 } as UnspentSum;
    const { evaluation } = build({ amount: sum.suggested, at: TODAY }, everyday());
    const state = evaluation.funds.unspent!;
    const fresh = { ...evaluation, funds: { ...evaluation.funds, unspent: { ...state, drifted: false, stale: false } } } as Evaluation;
    expect(unspentStateOf(fresh, held, TODAY)).toMatchObject({ kind: 'fresh', value: state.value - 10_000, anchor: sum.suggested - 10_000 });
    expect(toStoredAnchor(held.total, held)).toBe(sum.suggested);
  });
});

describe('daysSince', () => {
  it('counts whole days and never goes below 0 or fails on junk', () => {
    expect(daysSince('2026-10-03', '2026-11-12')).toBe(40);
    expect(daysSince('2026-10-03', '2026-10-03')).toBe(0);
    expect(daysSince('2026-10-10', '2026-10-03')).toBe(0);
    expect(daysSince('nope', '2026-10-03')).toBe(0);
  });
});
