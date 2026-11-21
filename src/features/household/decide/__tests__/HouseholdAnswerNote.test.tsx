// 08.1-23 (CMP-F19, owner 2026-11-21 Q6, Q12): the line naming the spending rule a check counted, on Who pays and on the answer.
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { answerLinesOf, spendNoteOf, whoPaysLineOf, type SpendNote } from '../spendNote';
import { HouseholdAnswerNote } from '../HouseholdAnswerNote';

jest.setTimeout(30000);
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
let mockLastShared: { member_id: string; last_date: string | null }[] = [];
jest.mock('@/data/queries/partnerMoney', () => ({ usePartnerLastSharedLine: () => ({ data: mockLastShared }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/household/useMemberLabel', () => ({ useMemberLabel: () => (key: string) => (key === 'sam' ? 'Sam' : key) }));
let mockNote: SpendNote | null = null;
jest.mock('../useSpendNote', () => ({ useSpendNote: () => mockNote }));

const note = (over: Partial<SpendNote>): SpendNote => ({ counted: 'bring', outOfDate: false, myPercent: null, jointAccounts: [], ...over });

beforeEach(() => {
  mockLastShared = [];
  mockNote = null;
});

describe('spendNote (pure)', () => {
  it('is nothing without a view', () => {
    expect(spendNoteOf(null, [])).toBeNull();
    expect(whoPaysLineOf(null, 'household')).toBeNull();
    expect(answerLinesOf(undefined)).toEqual([]);
  });

  it('Who pays names the rule for Household', () => {
    expect(whoPaysLineOf(note({}), 'household')).toEqual({ key: 'decide.screens.stepper.whoPays.helperBring' });
    expect(whoPaysLineOf(note({ counted: 'custom', myPercent: 40 }), 'household')).toEqual({ key: 'decide.screens.stepper.whoPays.helperShares', values: { percent: 40 } });
    expect(whoPaysLineOf(note({ counted: 'bill', myPercent: 60 }), 'household')).toEqual({ key: 'decide.screens.stepper.whoPays.helperShares', values: { percent: 60 } });
  });

  it('Just me names the joint account, the plural for more than one, and nothing without one', () => {
    expect(whoPaysLineOf(note({}), 'me')).toBeNull();
    expect(whoPaysLineOf(note({ jointAccounts: [{ id: 'j', name: 'Our pot' }] }), 'me')).toEqual({ key: 'decide.screens.stepper.whoPays.jointMe', values: { account: 'Our pot' } });
    expect(whoPaysLineOf(note({ jointAccounts: [{ id: 'j', name: 'A' }, { id: 'k', name: 'B' }] }), 'me')).toEqual({ key: 'decide.screens.stepper.whoPays.jointMeMany' });
  });

  it('the answer says which rule was counted, and the out-of-date line after it', () => {
    expect(answerLinesOf(note({}))).toEqual([{ key: 'decide.screens.answer.household.ruleBring' }]);
    expect(answerLinesOf(note({ counted: 'custom', myPercent: 30 }))).toEqual([{ key: 'decide.screens.answer.household.ruleShares', values: { percent: 30 } }]);
    expect(answerLinesOf(note({ counted: 'bill', myPercent: 50 }))).toEqual([{ key: 'decide.screens.answer.household.ruleBill', values: { percent: 50 } }]);
    expect(answerLinesOf(note({ outOfDate: true }))).toEqual([{ key: 'decide.screens.answer.household.ruleBring' }, { key: 'decide.screens.answer.household.outOfDate' }]);
  });
});

const show = () =>
  render(
    <ThemeProvider>
      <HouseholdAnswerNote householdId="h1" today="2026-11-20" />
    </ThemeProvider>,
  );

describe('HouseholdAnswerNote', () => {
  it('draws nothing with no rule and no stale shared bills', async () => {
    await show();
    expect(screen.toJSON()).toBeNull();
  });

  it('names the counted rule in words', async () => {
    mockNote = note({ counted: 'bill', myPercent: 60 });
    await show();
    expect(screen.getByText('Counted: your 60% of the shared money, the same as the bill split.')).toBeTruthy();
  });

  it('adds the out-of-date line, the same words as settings', async () => {
    mockNote = note({ outOfDate: true });
    await show();
    expect(screen.getByText('Counted: what you bring.')).toBeTruthy();
    expect(screen.getByText('Spending shares need updating: someone joined or left. Until then each check counts what each person brings.')).toBeTruthy();
  });

  it('keeps the shared-bills caveat beside the rule line', async () => {
    mockNote = note({ counted: 'custom', myPercent: 45 });
    mockLastShared = [{ member_id: 'sam', last_date: '2026-09-01' }];
    await show();
    expect(screen.getByText('Counted: your 45% of the shared money.')).toBeTruthy();
    expect(screen.getByTestId('shared-bills-caveat')).toBeTruthy();
  });
});
