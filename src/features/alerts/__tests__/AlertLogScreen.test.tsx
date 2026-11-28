import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AlertLogScreen, groupByDay } from '../AlertLogScreen';
import { alertText } from '../alertText';
import type { AlertLogEntry } from '@/db/alerts';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(30000);

let mockLog: AlertLogEntry[] = [];
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', homeCurrency: 'USD', showCents: false, timeZone: 'UTC' }),
}));
jest.mock('@/data/queries/alerts', () => ({
  useAlertLog: () => ({ data: mockLog }),
  useAlertPrefs: () => ({ data: { timeZone: 'UTC' } }),
}));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));

const entry = (over: Partial<AlertLogEntry>): AlertLogEntry => ({
  id: 'a',
  kind: 'bills_due',
  params: {},
  refTable: null,
  refId: null,
  raisedAt: '2026-11-22T14:00:00Z',
  deliveredAt: '2026-11-22T14:00:05Z',
  heldForQuiet: false,
  delivery: 'sent',
  ...over,
});

const renderScreen = async () => {
  const view = await render(
    <ThemeProvider>
      <AlertLogScreen />
    </ThemeProvider>
  );
  await waitFor(() => expect(screen.getAllByTestId('alert-log-screen').length).toBeGreaterThan(0));
  return view;
};

describe('AlertLogScreen', () => {
  it('shows the empty state', async () => {
    mockLog = [];
    await renderScreen();
    expect(screen.getByText('No alerts yet')).toBeTruthy();
  });

  it('lists alerts grouped by day, with the quiet-held badge', async () => {
    mockLog = [
      entry({ id: '1', kind: 'bills_due', params: { bill: 'Rent', amount_minor: 120000, currency: 'USD', lead_days: 1 } }),
      entry({
        id: '2',
        kind: 'partner_large',
        params: { who: 'Sam', hidden: false, category: 'Home', amount_minor: 32000, currency: 'USD' },
        heldForQuiet: true,
      }),
      entry({ id: '3', kind: 'low_balance', raisedAt: '2026-11-20T09:00:00Z', params: { account: 'Everyday', amount_minor: 9000, currency: 'USD' } }),
    ];
    await renderScreen();
    expect(screen.getByText('Rent, $1,200, is due tomorrow.')).toBeTruthy();
    expect(screen.getByText('Sam spent $320 on Home')).toBeTruthy();
    expect(screen.getByText('Everyday is below $90.')).toBeTruthy();
    expect(screen.getAllByTestId('status-badge-quietHeld')).toHaveLength(1);
    expect(groupByDay(mockLog, 'UTC').map((g) => g.day)).toEqual(['2026-11-22', '2026-11-20']);
  });
});

describe('alertText', () => {
  const t = (key: string, o?: Record<string, string | number>) =>
    ({
      'system.push.partnerLargeHidden': 'A household member spent {amount} on {category}',
      'system.push.partnerLargePrivate': 'A household member spent {amount}.',
      'system.push.partnerLarge': '{who} spent {amount} on {category}',
    })[key]?.replace(/\{(\w+)\}/g, (_, k: string) => String(o?.[k])) ?? key;
  const fmt = (m: { amount: number }) => `$${m.amount / 100}`;
  it('respects hidden names and private categories, and never carries a note or payee', () => {
    const base = { amount_minor: 32000, currency: 'USD', note: 'secret', payee: 'Bob' };
    expect(alertText({ kind: 'partner_large', params: { ...base, who: 'Sam', hidden: true, category: 'Home' } }, t, fmt as never)).toBe(
      'A household member spent $320 on Home'
    );
    expect(alertText({ kind: 'partner_large', params: { ...base, who: null, hidden: true, category: null } }, t, fmt as never)).toBe('A household member spent $320.');
    const out = alertText({ kind: 'partner_large', params: { ...base, who: 'Sam', hidden: false, category: 'Home' } }, t, fmt as never);
    expect(out).not.toMatch(/secret|Bob/);
  });
});
