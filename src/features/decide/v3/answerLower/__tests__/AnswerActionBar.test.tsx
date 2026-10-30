/** Plan 05.3-38: the action bar follows the actionBar model and D-19 starts a new check without writing the old one. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { AnswerActionBar } from '../AnswerActionBar';

jest.setTimeout(60000);

const mockPushOnce = jest.fn();
const mockReopen = jest.fn(() => 'new-id');
const mockSaveDraft = jest.fn();
const mockSaveAnswer = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPushOnce(h) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: mockReopen }),
  useSaveCheckDraft: () => ({ save: mockSaveDraft }),
  useSaveCheckAnswer: () => ({ save: mockSaveAnswer }),
}));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({
  useV3Format: () => ({ params: (p: Record<string, { iso?: string }>) => ({ screen: Object.fromEntries(Object.entries(p).map(([k]) => [k, '28 Oct'])), a11y: {} }) }),
}));

beforeEach(() => jest.clearAllMocks());
afterEach(cleanup);

const row = { id: 'orig-1', household_id: 'h', created_by: 'u', kind: 'buy', name: 'Sofa', inputs: {} } as never;
const res = (code: string, extra: Record<string, unknown> = {}) => ({ code, variant: null, readyBy: null, ...extra }) as never;

function filled(label: string): boolean {
  const s = StyleSheet.flatten(screen.getByLabelText(label).props.style);
  return s.backgroundColor === '#1B4D3E';
}

describe('AnswerActionBar', () => {
  it('fits_unspent: Record as bought is the filled accent, Save the plan outlined, Not buying it a text button', async () => {
    const cb = { onBought: jest.fn(), onPlan: jest.fn(), onNotBuying: jest.fn() };
    await wrap(<AnswerActionBar result={res('fits_unspent')} row={row} {...cb} />);
    expect(filled('Record as bought')).toBe(true);
    expect(filled('Save the plan')).toBe(false);
    expect(screen.getByLabelText('Not buying it')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Record as bought'));
    await fireEvent.press(screen.getByLabelText('Save the plan'));
    await fireEvent.press(screen.getByLabelText('Not buying it'));
    expect(cb.onBought).toHaveBeenCalledTimes(1);
    expect(cb.onPlan).toHaveBeenCalledTimes(1);
    expect(cb.onNotBuying).toHaveBeenCalledTimes(1);
  });

  it('not_yet payday: Remind me with the date is filled', async () => {
    const r = res('not_yet', { variant: 'payday', readyBy: { kind: 'date', date: '2026-10-28' } });
    await wrap(<AnswerActionBar result={r} row={row} onBought={jest.fn()} onPlan={jest.fn()} onNotBuying={jest.fn()} />);
    expect(filled('Remind me 28 Oct')).toBe(true);
    expect(filled('Record as bought')).toBe(false);
  });

  it('needs_input: both pills outlined', async () => {
    await wrap(<AnswerActionBar result={res('needs_input')} row={row} onBought={jest.fn()} onPlan={jest.fn()} onNotBuying={jest.fn()} />);
    expect(filled('Record as bought')).toBe(false);
    expect(filled('Save the plan')).toBe(false);
  });

  it('D-19: Check another price reopens once, opens the new id with the price focused and writes nothing to the original', async () => {
    await wrap(<AnswerActionBar result={res('fits_month')} row={row} onBought={jest.fn()} onPlan={jest.fn()} onNotBuying={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Check another price'));
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect((mockReopen.mock.calls as unknown as [{ id: string }][])[0]![0].id).toBe('orig-1');
    expect(mockPushOnce).toHaveBeenCalledTimes(1);
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/purchase/[id]', params: { id: 'new-id', focus: 'price' } });
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockSaveAnswer).not.toHaveBeenCalled();
  });
});
