import fs from 'fs';
import path from 'path';
import React from 'react';
import { screen } from '@testing-library/react-native';
import { Step3Verdict, type Step3Props } from '../steps/Step3Verdict';
import { buy, stepProps, wrap } from '../steps/__tests__/helpers/stepProps';
import { loggedSource, month, roughSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { minorUnits } from '@/engine/money';
import type { SnapshotResult } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

type Loose = Record<string, unknown>;
type Node = { props?: Loose; children?: (Node | string)[] | null };

function strongSource(): SnapshotResult {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));
  const pay = { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-04-01', endDate: null, occurrenceCount: null, latestAmount: 500_000, currency: 'USD', lastPaidDate: '2026-10-01' } as never;
  const base = loggedSource({ cashOnHand: minorUnits(4_000_000), incomeSeries: [pay], months, monthlyInvesting: minorUnits(0), limits: { reserve: null, dsrLine: null, housingLine: null, unsecuredIncomeMultiple: null, investingFloor: minorUnits(0), savingFloor: null, spareFloor: null } }, 4_000_000);
  return { ...base, meta: { ...base.meta, fullMonths: 6 } };
}

function propsFor(source: SnapshotResult = strongSource()): Step3Props {
  return { ...stepProps(buy({ advertised: 150_000, method: 'cash' }), {}, source), lastSeenBasis: null, revealKey: 'k1' };
}

function onTheEdge(p: Step3Props): Step3Props {
  const c = p.computation as unknown as { decision: Loose & { verdict: Loose }; verdict: Loose };
  const decision = { ...c.decision, margins: [{ line: 'month', margin: 12_000, threshold: 0, flag: 'on_edge' }] };
  return { ...p, computation: { ...p.computation, decision } as unknown as Step3Props['computation'] };
}

/** The focus stops of the rendered tree in tree order: accessible elements and buttons. */
function focusStops(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (n: Node | string | null | undefined): void => {
    if (n === null || n === undefined || typeof n === 'string') return;
    const props = n.props ?? {};
    const label = props.accessibilityLabel;
    if ((props.accessible === true || props.accessibilityRole === 'button') && typeof label === 'string' && out[out.length - 1] !== label) out.push(label);
    (n.children ?? []).forEach(walk);
  };
  walk(tree as Node);
  return out;
}

describe('VerdictCard (05-63)', () => {
  it('D-74 the card shows the state words, one reason and three key figures', async () => {
    await wrap(<Step3Verdict {...propsFor()} />);
    expect(screen.getByRole('header').props.children).toBe('It fits');
    expect(screen.getByText(/It clears every line, with .* still spare at month end\./)).toBeTruthy();
    expect(screen.getByText('Free a month')).toBeTruthy();
    expect(screen.getByText('Cushion')).toBeTruthy();
    expect(screen.getByText('A month')).toBeTruthy();
    expect(screen.getByLabelText(/^Free each month after this: .*\. Cushion: .* of costs\. Monthly cost: /)).toBeTruthy();
    expect(screen.getByText(/Average month/)).toBeTruthy();
    expect(screen.queryByText(/ in, .* out once this is running/)).toBeNull();
  });

  it('D-74 a first read draws figures from rough spending', async () => {
    await wrap(<Step3Verdict {...propsFor(roughSource())} />);
    expect(screen.getByLabelText(/^Free each month after this: /)).toBeTruthy();
    expect(screen.getByText('First read · your figures')).toBeTruthy();
  });

  it('D-74 missing shows no key figures', async () => {
    await wrap(<Step3Verdict {...propsFor(unconvertedSource())} />);
    expect(screen.getByRole('header').props.children).toBe('Missing terms');
    expect(screen.queryByText('Cushion')).toBeNull();
    expect(screen.queryByLabelText(/^Free each month after this/)).toBeNull();
  });

  it('D-70 size, edge and cushion carry an ⓘ', async () => {
    await wrap(<Step3Verdict {...onTheEdge(propsFor())} />);
    expect(screen.getByLabelText('About How big this is')).toBeTruthy();
    expect(screen.getByLabelText('About On the edge')).toBeTruthy();
    expect(screen.getByLabelText('About Cushion')).toBeTruthy();
    expect(screen.getByLabelText(/^Basis: .*, tap for reasons$/)).toBeTruthy();
  });

  it('R2 the card has three focus stops in order', async () => {
    const view = await wrap(<Step3Verdict {...onTheEdge(propsFor())} />);
    const stops = focusStops(view.toJSON());
    const at = (re: RegExp): number => stops.findIndex((s) => re.test(s));
    const order = [/^It fits, on the edge/, /^About How big this is$/, /^About On the edge$/, /^Basis: /, /^Free each month after this/, /^About Cushion$/].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.getAllByLabelText(/^It fits, on the edge/)[0]!.props.accessibilityLiveRegion).toBe('polite');
  });

  it('D-76 the verdict card clamps no system copy', async () => {
    await wrap(<Step3Verdict {...propsFor()} />);
    expect(screen.getByText('It fits').props.numberOfLines).toBeUndefined();
    const source = fs.readFileSync(path.join(__dirname, '..', 'VerdictCard.tsx'), 'utf8');
    expect(source).not.toMatch(/numberOfLines|marginVertical: -|position: 'absolute'/);
  });
});
