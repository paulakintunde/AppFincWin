/** Plan 05.3-40: the purpose, payment plan and item costs cards fit the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0. */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import type { Evaluation } from '@/engine/decide/v3';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { emptyCheck, withItemType, withPayMode, withPrice, withPurpose } from '../../model/checkEdits';
import { ItemCostsCard } from '../ItemCostsCard';
import { PaymentPlanCard } from '../PaymentPlanCard';
import { PurposeBlock } from '../PurposeBlock';
import { Stateful } from './harness';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../nav/hrefs', () => ({ planHref: (id: string) => `/decide/plan/${id}` }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true, today: '2026-10-31' }),
}));
jest.mock('@/features/decide/v3/check/useOwnOptions', () => ({
  useOwnOptions: () => ({ itemTypes: [], purposes: [], retired: new Map(), liveCount: { itemTypes: 0, purposes: 0 }, add: jest.fn() }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ date: (iso: string) => iso, money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));

const EVAL = {
  purchase: { schedule: { count: 60, payment: 52000, cadence: { unit: 'month', every: 1 }, monthlyEquivalent: 52000 } },
  planCard: { total: 3300000 },
} as unknown as Evaluation;

describe('purpose, payment plan and item costs fit the R6 checks', () => {
  for (const m of MATRIX) {
    it(`at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      const initial = withPurpose(
        withPayMode(withItemType(withPrice(emptyCheck(), 2700000 as never), { kind: 'preset', value: 'vehicle' }), 'plan'),
        { kind: 'preset', value: 'necessity' },
      );
      await render(
        <Stateful initial={initial} scale={m.scale}>
          {({ check, edit }) => (
            <>
              <PurposeBlock check={check} edit={edit} />
              <PaymentPlanCard check={check} evaluation={EVAL} edit={edit} checkId="c" currency="USD" />
              <ItemCostsCard check={check} edit={edit} currency="USD" prefillSeries={[]} />
            </>
          )}
        </Stateful>,
      );
      expect(screen.getByTestId('purpose-block')).toBeTruthy();
      expect(screen.getByTestId('payment-plan-card')).toBeTruthy();
      expect(screen.getByTestId('item-costs-card')).toBeTruthy();
      expectFits({ clampCount: 0 });
      await cleanup();
    });
  }
});
