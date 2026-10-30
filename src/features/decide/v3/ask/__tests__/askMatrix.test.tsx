/** 05.3-32: the question card with each body at 320 / 402 wide x 1.0x / 2.0x (R18 matrix). */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, expectTargets, matrixName } from '../../../__tests__/helpers/r18Fit';
import { AskCard } from '../AskCard';
import { AccountUseBody } from '../AccountUseBody';
import { PayArrivalBody } from '../PayArrivalBody';
import { VolatileCoverBody } from '../VolatileCoverBody';
import { accountUseQuestion, coverQuestion, modelOf, payQuestion } from './askTestKit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./askTestKit').fakeFormat }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: jest.fn() }) }));
jest.mock('@/data/mutations/accountUse', () => ({
  useSaveAccountUse: () => ({ save: jest.fn() }),
  useSaveEmergencyFund: () => ({ save: jest.fn(), remove: jest.fn() }),
}));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [{ id: 'a1', household_id: 'h1', name: 'Everyday Checking', kind: 'checking', currency: 'USD', opening_balance: 0, archived_at: null, deleted_at: null, version: 1, use: null, use_purpose: null, use_envelope_id: null, use_extra_set_aside: null }],
  }),
}));
jest.mock('@/data/queries/activity', () => ({ useAccountBalances: () => ({ balances: new Map(), isLoading: false }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { plain: [], live: [], wait: [], done: [] } }), useDecideSettings: () => ({ data: null }) }));
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ status: 'ready', inputs: null, evaluation: { month: { e: 100000, recurringBills: 200000 } }, refetch: () => undefined }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

afterEach(cleanup);

const ids = { checkId: 'c1', userId: 'u1', householdId: 'h1' };

describe.each(MATRIX)('question card at $width wide x $scale', (m) => {
  const cell = () => {
    mockWidth = m.width;
    mockScale = m.scale;
  };

  it(`account use fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(
      <AskCard model={modelOf(accountUseQuestion(), 2)} onDone={jest.fn()} renderBody={(q, s) => <AccountUseBody question={q} onSaved={s} {...ids} />} />,
      m.scale
    );
    expectFits();
    expectTargets('Everyday', 'A mix', 'Kept for one thing', 'Savings I don’t touch');
    expect(screen.getByText('and 2 more questions')).toBeTruthy();
  });

  it(`pay arrival fits and stacks the buttons (${matrixName(m)})`, async () => {
    cell();
    await wrap(
      <AskCard model={modelOf(payQuestion())} onDone={jest.fn()} renderBody={(q, s) => <PayArrivalBody question={q} onSaved={s} {...ids} />} />,
      m.scale
    );
    expectFits();
    expectTargets('Yes, it arrived', 'No, not yet');
  });

  it(`low-month cover fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(
      <AskCard model={modelOf(coverQuestion())} onDone={jest.fn()} renderBody={(q, s) => <VolatileCoverBody question={q} onSaved={s} {...ids} />} />,
      m.scale
    );
    expectFits();
    expectTargets('Yes, I can cover it', 'No, I can’t');
    expect(screen.getByText('This is only your answer. It is not checked against your records.')).toBeTruthy();
  });
});
