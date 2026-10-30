/** Plan 05.3-33: the four answer bodies fit the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { AskQuestion } from '@/features/decide/v3/model/ask';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { UnspentBody } from '../UnspentBody';
import { UnexplainedBody } from '../UnexplainedBody';
import { IncomePatternBody } from '../IncomePatternBody';
import { ExpectedIncomeBody } from '../ExpectedIncomeBody';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/features/decide/setup/useUnspent', () => ({
  useUnspent: () => ({ sum: { total: 84000 }, lines: null, currency: 'USD', confirm: () => null }),
}));
jest.mock('@/data/mutations/decideSetup', () => ({
  useSaveSetupStep: () => ({ save: () => null }),
  useSaveUnexplainedAnswer: () => ({ save: () => null }),
}));
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: () => null }) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ today: '2026-10-30', homeCurrency: 'USD' }) }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({ useV3Format: () => ({ month: () => 'November' }) }));

const q = (code: string, months: string[] = []): AskQuestion =>
  ({ code, questionKey: 'k', variant: null, params: { amount: 25000 }, pay: null, months }) as unknown as AskQuestion;
const base = { checkId: 'c1', userId: 'u1', householdId: 'h1', onSaved: jest.fn() };

const CASES: readonly [string, () => React.ReactElement, RegExp[]][] = [
  ['unspent', () => <UnspentBody {...base} question={q('unspent_not_confirmed')} />, [/That’s right/, /Use my own figure/]],
  ['unexplained', () => <UnexplainedBody {...base} question={q('unexplained_money_question')} />, [/spare/, /envelope or goal/, /bill/, /Someone else/]],
  ['income pattern', () => <IncomePatternBody {...base} question={q('income_pattern_unconfirmed')} />, [/Steady/, /Changes month to month/, /seasons/]],
  ['expected income', () => <ExpectedIncomeBody {...base} question={q('expected_income_needed', ['2026-11', '2026-12'])} />, [/Save expected income/]],
];

describe('the in-check answer bodies fit the R6 checks', () => {
  for (const [name, make, targets] of CASES) {
    for (const m of MATRIX) {
      it(`${name} at ${matrixName(m)}`, async () => {
        mockWidth = m.width;
        mockScale = m.scale;
        await render(
          <ThemeProvider>
            <FontScaleProvider value={mockScale}>{make()}</FontScaleProvider>
          </ThemeProvider>,
        );
        for (const t of targets) expect(screen.getAllByLabelText(t).length).toBeGreaterThan(0);
        expectFits();
      });
    }
  }
});
