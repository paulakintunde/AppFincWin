/**
 * Plan 05.2-32: text-fit for the assembled stepper (shell + a representative step), at 320 / 402 dp and text scale
 * 1.0 / 2.0, using the R18 fit checks. 05.2-23 had no matrix of its own; the income and step suites cover the bodies.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { SetupStepper } from '@/features/decide/setup/SetupStepper';
import type { SetupFacts, SetupStepKey } from '@/features/decide/setup/setupFlow';
import { renderSetupStep, stepTitleKey } from '../setupRegistry';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: { id: 'u1', decide_v3: true } }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: jest.fn(() => null) }) }));
jest.mock('@/data/mutations/seriesAttributes', () => ({
  useConfirmRegularCandidate: () => ({ confirm: jest.fn() }),
  usePatchSeriesAttributes: () => ({ patch: jest.fn() }),
}));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEditSeriesFrom: () => ({ editFrom: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { income_types: ['salary_or_wages'], variable_method: 'steady' } }) }));
jest.mock('@/features/decide/setup/useSetupFacts', () => ({ useSetupFacts: () => mockFacts }));
jest.mock('@/shell/header/SyncProblemLine', () => ({ SyncProblemLine: () => null }));
jest.mock('@/shell/header/BackButton', () => {
  const { Pressable } = jest.requireActual('react-native');
  return { BackButton: ({ onPress }: { onPress: () => void }) => <Pressable accessibilityRole="button" accessibilityLabel="Back" style={{ minHeight: 44, minWidth: 44 }} onPress={onPress} /> };
});
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({
    status: 'ready',
    refetch: jest.fn(),
    inputs: {
      asOf: '2026-10-15',
      currency: 'USD',
      months: [],
    },
    evaluation: {
      month: { month: '2026-10', moneyIn: 123_456_789_00, moneyOut: 98_765_432_10, monthLeft: 24_691_356_90, typicalLeft: 24_691_356_90 },
      funds: {
        unspent: { value: 240_000_00, anchor: { amount: 240_000_00, at: '2026-10-15' }, rolled: false, stale: false, drifted: false, breakdown: {} },
        suggested: 238_000_00,
        emergency: 900_000_00,
        envelopesSaved: 250_000_00,
      },
    },
  }),
}));
jest.mock('@/features/income/useIncomeContext', () => ({
  useIncomeContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'USD',
    timeZone: 'UTC',
    today: '2026-10-15',
    settings: null,
    accounts: [{ id: 'a1', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null }],
    series: [],
    found: null,
  }),
}));

const mockFacts: SetupFacts = {
  incomeTypes: ['salary_or_wages'],
  hasRegularPaySeries: false,
  method: null,
  spreadMonths: null,
  steadyAmount: null,
  holdMonths: null,
  fullMonthsOfRecords: 6,
  moneyAccountIds: ['a1'],
  accountIdsWithUse: [],
  everydayOverride: null,
  unspentAnchorSet: false,
  roughTyped: false,
  setupDoneAt: null,
};

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount(startAt: SetupStepKey | undefined) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={mockScale}>
          <SetupStepper
            mode="full"
            {...(startAt !== undefined ? { startAt } : {})}
            renderStep={renderSetupStep}
            stepTitleKey={stepTitleKey}
            onChangeAnswer={() => undefined}
            onClose={() => undefined}
          />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('assembled stepper fits the R6 checks', () => {
  for (const m of MATRIX) {
    for (const [name, startAt] of [['Welcome', undefined], ['paid (a needed step)', 'paid'], ['Summary', 'summary']] as const) {
      it(`${name} at ${matrixName(m)}`, async () => {
        mockWidth = m.width;
        mockScale = m.scale;
        await mount(startAt);
        expect(screen.getByLabelText(startAt === 'summary' ? 'Done' : startAt === undefined ? 'Start' : 'Next')).toBeTruthy();
        if (startAt === 'summary') {
          expect(screen.getByText('On track to leave')).toBeTruthy();
          expect(screen.getByText('Change an answer')).toBeTruthy();
        }
        expectFits();
        await cleanup();
      });
    }
  }
});
