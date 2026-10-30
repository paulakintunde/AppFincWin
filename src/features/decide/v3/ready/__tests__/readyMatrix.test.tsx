/**
 * Plans 05.3-26 and 05.3-58: the not-ready card at 320 / 402 wide x 1.0x / 2.0x. Text is whole (no clamp), chips wrap by
 * whole word, every chip and link is a 44 button, and TalkBack reads each item as one group followed by its buttons.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, render, screen } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { Readiness } from '@/engine/decide/v3';
import { MATRIX, allNodes, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { NotReadyCard } from '../NotReadyCard';
import { evidence, fiveEnvelopes } from './notReadyKit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./notReadyKit').fakeFormat }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ today: '2026-10-30', userId: 'u1', householdId: 'h1' }) }));
jest.mock('../useReadinessAnswer', () => ({ useReadinessAnswer: () => ({ answer: jest.fn(), clearWaiver: jest.fn() }) }));

const ALL = { ready: false, missing: ['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing'] } as unknown as Readiness;

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

function show(readiness: Readiness, cell: { width: number; scale: number }): Promise<unknown> {
  mockWidth = cell.width;
  mockScale = cell.scale;
  return render(
    <FontScaleProvider>
      <ThemeProvider>
        <NotReadyCard readiness={readiness} thisMonth="2026-10" />
      </ThemeProvider>
    </FontScaleProvider>,
  );
}

/** Every rule the matrix holds the asking card to, beyond expectFits(). */
function expectAskingLayout(): void {
  const nodes = allNodes();
  // no Text clamps
  expect(nodes.filter((n) => n.type === 'Text' && n.props.numberOfLines !== undefined)).toHaveLength(0);
  const buttons = screen.getAllByRole('button');
  expect(buttons.length).toBeGreaterThan(0);
  for (const b of buttons) {
    // each chip and link: its own button with its visible label, 44 tall, never inside another accessible element
    expect(b.props.accessibilityRole).toBe('button');
    expect(typeof b.props.accessibilityLabel).toBe('string');
    expect(screen.getAllByText(b.props.accessibilityLabel as string).length).toBeGreaterThan(0);
    expect(Number(flat(b).minHeight)).toBeGreaterThanOrEqual(44);
    expect(flat(b).width).toBeUndefined();
    for (let p = b.parent; p; p = p.parent) if (typeof p.type === 'string') expect(p.props.accessible).not.toBe(true);
  }
  // chips wrap by whole word: every chip row is a wrapping row
  const rows = nodes.filter((n) => typeof n.type === 'string' && flat(n).flexWrap !== undefined);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    expect(flat(r).flexDirection).toBe('row');
    expect(flat(r).flexWrap).toBe('wrap');
  }
}

/** The accessible text groups (not buttons): one per item, label from title to question. */
const textGroups = (): ReactTestInstance[] =>
  allNodes().filter((n) => typeof n.type === 'string' && n.props.accessible === true && n.props.accessibilityRole === undefined && typeof n.props.accessibilityLabel === 'string');

describe.each(MATRIX)('NotReadyCard matrix', (cell) => {
  afterEach(cleanup);

  it(`${matrixName(cell)}: code-only items are whole and their buttons are 44`, async () => {
    await show(ALL, cell);
    expectFits();
    expectTargets('Open envelopes');
    expectAskingLayout();
    expect(textGroups()).toHaveLength(3);
  });

  it(`${matrixName(cell)}: the owner evidence fits, every chip and link is a 44 button`, async () => {
    await show(evidence(), cell);
    expectFits();
    expectTargets('September is complete as it is', 'October is up to date as it is', 'It arrived', 'My money comes from elsewhere', 'Nothing else to add');
    expectAskingLayout();
    expect(screen.getAllByLabelText('Someone else always pays this')).toHaveLength(2);
    // each item is one TalkBack group: the label starts with the title and ends with the question
    const groups = textGroups();
    expect(groups.map((g) => g.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Income, 16,199 dollars and 42 cents, on 3 Sep\. .+ Did it arrive\?$/),
      expect.stringMatching(/^Netflix, 11 dollars and 99 cents, due 3 Sep\. .+ Was it paid\?$/),
      expect.stringMatching(/^Lunch, 10 dollars and 0 cents, due 21 Sep\. .+ Was it paid\?$/),
      expect.stringMatching(/^Everyday spending\. .+ Anything more to add\?$/),
    ]);
    // reading order: the item's text group comes before its chips and link
    const order = allNodes().filter((n) => typeof n.type === 'string' && n.props.accessible === true);
    const netflix = order.indexOf(groups[1]!);
    expect(order[netflix + 1]!.props.accessibilityLabel).toBe('It was paid');
    expect(order[netflix + 4]!.props.accessibilityLabel).toBe('Someone else always pays this');
  });

  it(`${matrixName(cell)}: the longest chip wraps by word inside its pill`, async () => {
    await show(evidence(), cell);
    const pill = screen.getByLabelText('My money comes from elsewhere');
    const s = flat(pill);
    expect(s.width).toBeUndefined();
    expect(s.maxWidth).toBe('100%');
    const text = screen.getByText('My money comes from elsewhere');
    expect(text.props.numberOfLines).toBeUndefined();
    expect(flat(text).flexShrink ?? 0).not.toBeLessThan(0);
  });

  it(`${matrixName(cell)}: five envelopes fit as one named item`, async () => {
    await show(fiveEnvelopes(), cell);
    expectFits();
    expectTargets('Open envelopes');
    expectAskingLayout();
    expect(screen.getByText('Not linked to an account: Holiday fund, Car repairs, Emergency savings and 2 more')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
