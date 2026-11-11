// 06.1-39: D39 quick estimates: the live line, the write (rough_income, rough_spending = bills + everyday, rough_as_of), bounds, and the route's returnTo.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { expectFits } from '@/test/textFitMatrix';
import { safeReturnTo } from '../safeReturnTo';
import { QuickEstimatesScreen } from '../QuickEstimatesScreen';

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/shell/header/SyncProblemLine', () => ({ SyncProblemLine: () => null }));
jest.mock('@/shell/header/DetailHeader', () => ({ DetailHeader: () => null }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: () => undefined }));

const INCOME = 'About how much comes in each month?';
const BILLS = 'About how much goes on bills?';
const EVERYDAY = 'About how much on everyday spending?';

async function setup(over: Partial<React.ComponentProps<typeof QuickEstimatesScreen>> = {}, scale = 1) {
  const onSave = jest.fn();
  const onDone = jest.fn();
  await wrap(<QuickEstimatesScreen currency="USD" today="2026-11-11" stored={null} onSave={onSave} onDone={onDone} {...over} />, scale);
  return { onSave, onDone };
}
async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('QuickEstimatesScreen', () => {
  it('shows the three questions, the footnote and the legal footer', async () => {
    await setup();
    expect(screen.getByText('Before your records are ready. Round numbers are fine.')).toBeTruthy();
    expect(screen.getByLabelText(INCOME)).toBeTruthy();
    expect(screen.getByLabelText(BILLS)).toBeTruthy();
    expect(screen.getByLabelText(EVERYDAY)).toBeTruthy();
    expect(screen.getByText('Quick estimates count only until your records cover a full month.')).toBeTruthy();
    expect(screen.getByTestId('quick-footer')).toBeTruthy();
  });

  it('is not ready until all three figures are valid', async () => {
    const { onSave } = await setup();
    await type(INCOME, '3200');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('live line: what a usual month leaves, then how short it is', async () => {
    await setup();
    await type(INCOME, '3200');
    await type(BILLS, '1850');
    await type(EVERYDAY, '925');
    expect(screen.getByText('A usual month leaves about $425 by these estimates.')).toBeTruthy();
    await type(EVERYDAY, '2000');
    expect(screen.getByText('A usual month is about $650 short by these estimates.')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  });

  it('writes rough_income, rough_spending = bills + everyday and rough_as_of, then finishes', async () => {
    const { onSave, onDone } = await setup();
    await type(INCOME, '3200');
    await type(BILLS, '1850');
    await type(EVERYDAY, '925');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).toHaveBeenCalledWith({ rough_income: 320000, rough_spending: 277500, rough_as_of: '2026-11-11', currency: 'USD' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('leaves saving, debt and invest out of the write', async () => {
    const { onSave } = await setup();
    await type(INCOME, '100');
    await type(BILLS, '40');
    await type(EVERYDAY, '10');
    await fireEvent.press(screen.getByText('See the answer now'));
    const patch = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['currency', 'rough_as_of', 'rough_income', 'rough_spending']);
  });

  it('refuses a huge amount', async () => {
    const { onSave } = await setup();
    await type(INCOME, '99999999999999999');
    await type(BILLS, '10');
    await type(EVERYDAY, '10');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses bills and everyday that sum to zero', async () => {
    const { onSave } = await setup();
    await type(INCOME, '100');
    await type(BILLS, '0');
    await type(EVERYDAY, '0');
    await fireEvent.press(screen.getByText('See the answer now'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('fits at large text', async () => {
    await setup({}, 2);
    expectFits();
  });
});

describe('safeReturnTo', () => {
  it('follows a path inside /decide and nothing else', () => {
    expect(safeReturnTo('/decide/answer/0b2f3c4d-1111-2222-3333-444455556666')).toBe('/decide/answer/0b2f3c4d-1111-2222-3333-444455556666');
    expect(safeReturnTo('/decide')).toBe('/decide');
    expect(safeReturnTo(undefined)).toBe('/decide');
    expect(safeReturnTo('https://example.com')).toBe('/decide');
    expect(safeReturnTo('//evil.example')).toBe('/decide');
    expect(safeReturnTo('/decide/../settings')).toBe('/decide');
    expect(safeReturnTo(['/decide/check/price'])).toBe('/decide/check/price');
  });

  it('also follows exactly the onboarding import step, with a plain accountId only', () => {
    expect(safeReturnTo('/setup/history')).toBe('/setup/history');
    expect(safeReturnTo('/setup/history?accountId=acc-1_x')).toBe('/setup/history?accountId=acc-1_x');
    expect(safeReturnTo('/setup/history?accountId=a&next=https://evil.example')).toBe('/decide');
    expect(safeReturnTo('/setup/history/../account')).toBe('/decide');
    expect(safeReturnTo('/setup/history?accountId=')).toBe('/decide');
    expect(safeReturnTo('/setup/account')).toBe('/decide');
    expect(safeReturnTo('//setup/history')).toBe('/decide');
    expect(safeReturnTo('https://x.example/setup/history')).toBe('/decide');
  });
});
