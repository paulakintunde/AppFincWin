/**
 * Plan 05.3-25 (R6): hero + confidence chip + notices, and the open confidence sheet, at 320 / 402 wide x 1.0x / 2.0x.
 * Jest has no layout engine, so each cell renders at that width and text scale and asserts what the tree can show: no fixed
 * text height, no clamp, no negative margin, targets of 44 or more, whole labels, no raw placeholder.
 */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import type { Confidence, Notice } from '@/engine/decide/v3';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { AnswerHero } from '../AnswerHero';
import { ConfidenceChipV3 } from '../ConfidenceChipV3';
import { ConfidenceSheetV3 } from '../ConfidenceSheetV3';
import { NoticeTiles } from '../NoticeTiles';
import { NINE, wrap } from './kit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticWarning: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [{ id: 'cat-1', name: 'Groceries', builtin_key: null }] }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [], done: [] } }) }));

const ROUGH: Confidence = { level: 'rough', reasons: ['rough_figures', 'few_months', 'unspent_drifted'] as never };
const NOTICES: Notice[] = [
  { code: 'month_heading_short', values: { month: '2026-10', short: 123456789, categoryId: 'cat-1', largest: 87654321 } },
  { code: 'income_volatile', values: { payment: 20000, periods: 12, monthly: 20000, months: 12, leanFrom: '2026-05', leanTo: '2026-05', leanLeft: -87000 } },
  { code: 'envelope_location_assumed', values: { count: 1 } },
];

describe.each(MATRIX)('answer top, $width wide at $scale x', (cell) => {
  beforeEach(() => {
    mockWidth = cell.width;
    mockScale = cell.scale;
  });
  afterEach(cleanup);

  it(`${matrixName(cell)}: notices, hero and chip fit`, async () => {
    await wrap(
      <>
        <NoticeTiles notices={NOTICES} />
        <AnswerHero evaluation={NINE[1]!.ev} extraChip={<ConfidenceChipV3 confidence={ROUGH} onPress={jest.fn()} />} />
      </>,
      cell.scale,
    );
    expectFits();
    expectTargets(/Rough, from your figures\./);
  });

  it(`${matrixName(cell)}: the open sheet fits`, async () => {
    await wrap(<ConfidenceSheetV3 visible confidence={ROUGH} onClose={jest.fn()} />, cell.scale);
    expect(screen.getByText('How sure this answer is')).toBeTruthy();
    // the shipped SheetHeader Close control carries its own hit slop
    expectFits({ smallTargets: [/^Close$/] });
  });
});
