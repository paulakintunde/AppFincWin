// 06.1-18 (D-14, D-25, D-28): the first-answer gate. Intro card first (remembered by text version), then the safety-net question once.
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { FirstAnswerGate } from '../FirstAnswerGate';
import { introVersion } from '../introVersion';
import en from '@/i18n/locales/en';

jest.setTimeout(30000);

const mockAnswer = jest.fn();
const mockMarkIntro = jest.fn();
let mockStored: string | null = null;
let mockRows: unknown[] = [];
let mockSettings: unknown = { answered_net_not_set_at: null };

jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockSettings, isError: false }) }));
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockRows, isError: false }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ source: null, v3: null }) }));
jest.mock('@/features/grow/safetyNet/netPreview', () => ({ essentialMonthOf: () => null }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD' }) }));
jest.mock('@/features/decide/hints/decideHints', () => ({
  loadIntroSeenVersion: () => Promise.resolve(mockStored),
  markIntroSeen: (user: string, version: string) => {
    mockMarkIntro(user, version);
    return Promise.resolve();
  },
}));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null),
    SheetScroll: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const t = (key: string): string => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en) as string;
const net = { id: 'net', is_safety_net: true, deleted_at: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockStored = null;
  mockRows = [];
  mockSettings = { answered_net_not_set_at: null };
  mockAnswer.mockReturnValue({ status: 'created', stepId: 's1' });
});

const mount = (onDone = jest.fn()) => wrap(<FirstAnswerGate answer={((i: unknown) => mockAnswer(i)) as never} onDone={onDone} />).then(() => onDone);

describe('FirstAnswerGate', () => {
  it('first run shows the intro, then the question; neither unlocks anything', async () => {
    const onDone = await mount();
    expect(await screen.findByText('How Decide answers')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Got it'));
    expect(mockMarkIntro).toHaveBeenCalledWith('u1', introVersion(t));
    expect(await screen.findByText('Do you have a safety net? About how much?')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('an amount creates the net through the answer hook, then finishes', async () => {
    const onDone = await mount();
    await fireEvent.press(await screen.findByText('Got it'));
    await fireEvent.changeText(await screen.findByLabelText('About how much'), '2300');
    await fireEvent.press(screen.getByText('Save and see the answer'));
    expect(mockAnswer).toHaveBeenCalledTimes(1);
    expect(mockAnswer.mock.calls[0][0]).toMatchObject({ kind: 'amount', amount: 230000, currency: 'USD' });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('Not set yet writes the flag only and finishes', async () => {
    mockStored = introVersion(t);
    const onDone = await mount();
    await fireEvent.press(await screen.findByText('Not set yet'));
    expect(mockAnswer).toHaveBeenCalledTimes(1);
    expect(mockAnswer.mock.calls[0][0]).toEqual({ kind: 'not_set' });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('the same version and an answered question show nothing and finish', async () => {
    mockStored = introVersion(t);
    mockRows = [net];
    const onDone = await mount();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('How Decide answers')).toBeNull();
    expect(screen.queryByText('Do you have a safety net? About how much?')).toBeNull();
  });

  it('a Not set yet answered earlier never asks again', async () => {
    mockStored = introVersion(t);
    mockSettings = { answered_net_not_set_at: '2026-11-01T00:00:00Z' };
    const onDone = await mount();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Do you have a safety net? About how much?')).toBeNull();
  });

  it('a changed intro text shows the card again but not the question', async () => {
    mockStored = 'an-older-version';
    mockRows = [net];
    const onDone = await mount();
    expect(await screen.findByText('How Decide answers')).toBeTruthy();
    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Do you have a safety net? About how much?')).toBeNull();
    expect(mockMarkIntro).toHaveBeenCalledWith('u1', introVersion(t));
  });

  it('another-currency net shows the Grow link instead of finishing', async () => {
    mockStored = introVersion(t);
    mockAnswer.mockReturnValue({ status: 'other_currency' });
    const onDone = await mount();
    await fireEvent.changeText(await screen.findByLabelText('About how much'), '500');
    await fireEvent.press(screen.getByText('Save and see the answer'));
    expect(await screen.findByText('Change the size in Grow')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('introVersion', () => {
  it('is stable for the same text and changes with any line', () => {
    expect(introVersion(t)).toBe(introVersion(t));
    expect(introVersion((k) => (k.endsWith('.facts') ? 'other' : t(k)))).not.toBe(introVersion(t));
  });
});
