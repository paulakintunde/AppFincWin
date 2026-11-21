// 08.1-10 (D-03, APP-22, DCU-10, UX-21, T-08.1-29): the household parts of the answer. The top-bar sub-line carries the stage word
// before the scope below 3 full months and the scope alone from 3; the caveat under the answer names the partner who has not shared
// (through the member resolver, never the key); a check saved for later offers Record as bought.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import type { Basis, Caveat, Evaluation, MonthModel } from '@/engine/decide/v3';
import { wrap } from '@/test/stepProps';
import { AnswerFrame, type AnswerAction } from '../AnswerFrame';
import { AnswerTopBar } from '../AnswerTopBar';
import { HouseholdAnswerNote } from '@/features/household/decide/HouseholdAnswerNote';
import { ledgerRun, viewOf, type Run } from './fixtures';

jest.setTimeout(60000);
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticTick: jest.fn(), hapticTap: jest.fn(), hapticWarn: jest.fn() }));
let mockLastShared: { member_id: string; last_date: string | null }[] = [];
jest.mock('@/data/queries/partnerMoney', () => ({ usePartnerLastSharedLine: () => ({ data: mockLastShared }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/household/useMemberLabel', () => ({ useMemberLabel: () => (key: string) => (key === 'sam' ? 'Sam' : key) }));
// 08.1-23: the spending rule line reads the household live; none here (its own tests are in household/decide).
jest.mock('@/features/household/decide/useSpendNote', () => ({ useSpendNote: () => null }));

const noop = (): void => undefined;
const UP_TO = '2026-11-09';
const NAMES = { sam: 'Sam', lee: 'Lee', hidden: 'Teal' } as Record<string, string>;
const member = (k: string): string => NAMES[k] ?? '';

function textOf(n: ReactTestInstance): string {
  return n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
const allText = (): string => textOf(screen.root as unknown as ReactTestInstance);

interface Over {
  basis: Basis;
  caveats?: Caveat[];
  months?: number;
}
function evalOf(run: Run, o: Over): Evaluation {
  const e = run.evaluation;
  const months = o.months ?? 0;
  const month = {
    ...e.month,
    monthsUsed: Array.from({ length: months }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    incomePicture: { treated: 'steady', fullMonths: months },
  } as unknown as MonthModel;
  return { ...e, month, result: { ...e.result, confidence: { ...e.result.confidence, basis: o.basis }, caveats: o.caveats ?? [] } } as unknown as Evaluation;
}
const full = (): Over => ({ basis: { kind: 'partial', used: 2, lookedFor: 3, upTo: UP_TO }, months: 2 });
const notShared = (names: string): Caveat => ({ code: 'household_not_shared', values: { names } }) as unknown as Caveat;
const fewMonths: Caveat = { code: 'few_months', values: { months: 2, lookedFor: 3 } } as unknown as Caveat;

async function frame(o: Over, view?: Partial<ReturnType<typeof viewOf>>, onAction: (a: AnswerAction) => void = noop, names: Record<string, (k: string) => string> = { member }) {
  const r = ledgerRun('N02');
  return wrap(
    <AnswerFrame
      check={{ ...viewOf(r), ...view }}
      evaluation={evalOf(r, o)}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf, names }}
      onAction={onAction}
      onOption={noop}
      onCantSee={noop}
      onImport={noop}
    />
  );
}

const bar = (stage: 'first_read' | 'full' | 'deeper' | null, scopeLabel: string | null) =>
  wrap(<AnswerTopBar name="Laptop" priceText="$900.00" pay="cash" when="today" stage={stage} scopeLabel={scopeLabel} onBack={noop} onNewCheck={noop} onPay={noop} onWhen={noop} />);

describe('top-bar sub-line (APP-22, DCU-10)', () => {
  it('first read: "First read · Just you"', async () => {
    await bar('first_read', 'Just you');
    expect(textOf(screen.getByTestId('answer-subline'))).toBe('First read · Just you');
  });

  it('full answer: "Full answer · Household · Flat 4B"', async () => {
    await bar('full', 'Household · Flat 4B');
    expect(textOf(screen.getByTestId('answer-subline'))).toBe('Full answer · Household · Flat 4B');
  });

  it('three or more months: the scope alone, no stage word', async () => {
    await bar('deeper', 'Household · Flat 4B');
    expect(textOf(screen.getByTestId('answer-subline'))).toBe('Household · Flat 4B');
    await bar(null, 'Just you');
    expect(screen.getAllByTestId('answer-subline').map((n) => textOf(n))).toContain('Just you');
  });

  it('the stage word is in the bar\'s accessibility label, and the sub-line wraps (no line limit)', async () => {
    await bar('first_read', 'Just you');
    const label = screen.getByLabelText(/Laptop, \$900\.00\. First read · Just you/);
    expect(label).toBeTruthy();
    expect(screen.getByTestId('answer-subline').props.numberOfLines).toBeUndefined();
  });

  it('a stage with no scope still shows the stage word', async () => {
    await bar('full', null);
    expect(textOf(screen.getByTestId('answer-subline'))).toBe('Full answer');
  });

  it('no stage word and no scope: no sub-line', async () => {
    await bar('deeper', null);
    expect(screen.queryByTestId('answer-subline')).toBeNull();
  });

  it('the frame puts the stage of the evaluation before the scope label', async () => {
    await frame(full(), { scopeLabel: 'Household · Flat 4B' });
    expect(textOf(screen.getByTestId('answer-subline'))).toBe('Full answer · Household · Flat 4B');
  });
});

describe('the household caveat under the answer (D-03)', () => {
  it('at stage full, with [few_months, household_not_shared], the caveat shown is the household one', async () => {
    await frame({ ...full(), caveats: [fewMonths, notShared('sam')] });
    expect(textOf(screen.getByTestId('answer-caveat'))).toBe('Only your money is counted. Sam hasn’t shared theirs.');
  });

  it('two partners read plural: "Sam and Lee haven’t shared theirs."', async () => {
    await frame({ ...full(), caveats: [notShared('sam,lee')] });
    expect(textOf(screen.getByTestId('answer-caveat'))).toBe('Only your money is counted. Sam and Lee haven’t shared theirs.');
  });

  it('three partners read as a list', async () => {
    await frame({ ...full(), caveats: [notShared('sam,lee,hidden')] });
    expect(textOf(screen.getByTestId('answer-caveat'))).toBe('Only your money is counted. Sam, Lee and Teal haven’t shared theirs.');
  });

  it('a hidden name reads as its colour name (resolver only), never the member key', async () => {
    await frame({ ...full(), caveats: [notShared('hidden')] });
    expect(textOf(screen.getByTestId('answer-caveat'))).toBe('Only your money is counted. Teal hasn’t shared theirs.');
    expect(allText()).not.toContain('hidden');
  });

  it('with no resolver (or a name that cannot be found) the caveat is dropped rather than show a key', async () => {
    await frame({ ...full(), caveats: [notShared('ghost')] });
    expect(screen.queryByTestId('answer-caveat')).toBeNull();
    expect(allText()).not.toContain('ghost');
  });

  it('an empty names list is dropped too', async () => {
    await frame({ ...full(), caveats: [notShared('')] });
    expect(screen.queryByTestId('answer-caveat')).toBeNull();
  });
});

describe('Record as bought on a check saved for later (owner 2026-11-20)', () => {
  it('a waiting check offers "Record as bought" on its outcome line, and it opens the Bought screen action', async () => {
    const onAction = jest.fn();
    await frame(full(), { outcome: 'Saving for it since Nov 1.', canRecordBought: true }, onAction);
    fireEvent.press(screen.getByTestId('answer-outcome-bought'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'bought' });
    expect(screen.getByText('Record as bought')).toBeTruthy();
    expect(screen.getByTestId('answer-outcome-past')).toBeTruthy();
  });

  it('a bought or passed check shows no such button', async () => {
    await frame(full(), { outcome: 'Bought on Nov 12.' });
    expect(screen.queryByTestId('answer-outcome-bought')).toBeNull();
    expect(screen.getByTestId('answer-outcome-past')).toBeTruthy();
  });
});

describe('the shared-bills caveat on a Household answer (D-37)', () => {
  it('shows for a member whose last shared line is over 30 days old, naming them by the resolver', async () => {
    mockLastShared = [{ member_id: 'sam', last_date: '2026-09-01' }];
    await wrap(<HouseholdAnswerNote householdId="h1" today="2026-11-20" />);
    expect(screen.getByTestId('shared-bills-caveat')).toBeTruthy();
    expect(allText()).toContain('Sam hasn’t logged shared bills since');
  });

  it('is quiet for a recent line and for a member who never logged one', async () => {
    mockLastShared = [{ member_id: 'sam', last_date: '2026-11-10' }];
    await wrap(<HouseholdAnswerNote householdId="h1" today="2026-11-20" />);
    expect(screen.queryByTestId('shared-bills-caveat')).toBeNull();
    mockLastShared = [{ member_id: 'sam', last_date: null }];
    await wrap(<HouseholdAnswerNote householdId="h1" today="2026-11-20" />);
    expect(screen.queryByTestId('shared-bills-caveat')).toBeNull();
  });

  it('the frame draws the note between the answer and the legal block when it is given one', async () => {
    const r = ledgerRun('N02');
    await wrap(
      <AnswerFrame
        check={viewOf(r)}
        evaluation={evalOf(r, full())}
        said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
        onAction={noop}
        onOption={noop}
        onCantSee={noop}
        onImport={noop}
        householdNote={<HouseholdAnswerNote householdId="h1" today="2026-11-20" />}
      />
    );
    mockLastShared = [];
    expect(screen.queryByTestId('shared-bills-caveat')).toBeNull();
  });
});
