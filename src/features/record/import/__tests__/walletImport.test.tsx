// 10-26 (IMP-06, D-21..D-23; UI-SPEC section 8): the wallet preview -- reader chip, the new-accounts
// card (every switch off, nothing created without a tap), held-back lines, fee rows, a conversion row,
// the summary and the pinned Import pill, and the missing-column warning.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { readWallet, walletToDrafts, type WalletDrafts } from '@/engine/statement';
import { csv, REVOLUT_HEADER, revolutRow, WISE_HEADER, wiseRow } from '@/engine/statement/__tests__/wallets/synthetic';
import { walletPlan, type WalletChoices } from '../walletModel';
import { ReviewStep } from '../ReviewStep';
import type { useStatementImport } from '../useStatementImport';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
    }: {
      data: { key?: string }[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactElement;
      ListHeaderComponent?: React.ReactElement;
    }) => (
      <View>
        {ListHeaderComponent}
        {data.map((item, index) => (
          <View key={item.key ?? index}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'EUR',
    showCents: true,
    region: 'GB',
    timeZone: 'UTC',
    today: '2026-10-06',
  }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a-eur', name: 'Everyday', currency: 'EUR', kind: 'checking', archived_at: null }] }),
}));
const mockAdd = jest.fn(() => 'new-account-id');
jest.mock('@/data/mutations/accounts', () => ({ useAddAccount: () => ({ add: mockAdd }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));

type ImportState = ReturnType<typeof useStatementImport>;

function wise(): WalletDrafts {
  const read = readWallet(
    csv(WISE_HEADER, [
      wiseRow({ id: 'A', amount: '-10.00', currency: 'EUR', description: 'Coffee', fees: '0.30' }),
      wiseRow({ id: 'B', amount: '25.00', currency: 'GBP', description: 'Refund' }),
    ])
  );
  if (read === null || !read.ok) throw new Error('fixture');
  return walletToDrafts(read);
}

function revolut(): WalletDrafts {
  const read = readWallet(
    csv(REVOLUT_HEADER, [
      revolutRow({ type: 'EXCHANGE', description: 'Exchanged to GBP', amount: '-100.00', fee: '0.50', currency: 'EUR', date: '2026-03-05 10:00:00' }),
      revolutRow({ type: 'EXCHANGE', description: 'Exchanged from EUR', amount: '85.10', currency: 'GBP', date: '2026-03-05 10:00:00' }),
    ])
  );
  if (read === null || !read.ok) throw new Error('fixture');
  return walletToDrafts(read);
}

function stateFor(drafts: WalletDrafts, choices: WalletChoices = {}, over: Partial<ImportState> = {}): ImportState {
  const accounts = [{ id: 'a-eur', name: 'Everyday', currency: 'EUR', archived: false }];
  return {
    stage: 'review',
    wallet: drafts,
    walletError: null,
    walletPlan: walletPlan(drafts, accounts, choices),
    walletUnlinked: choices.unlinked ?? new Set<number>(),
    setWalletCreate: jest.fn(),
    linkWalletAccount: jest.fn(),
    toggleWalletConversion: jest.fn(),
    skipWalletLines: jest.fn(),
    matchWalletColumns: jest.fn(),
    commit: jest.fn(),
    commitProblem: null,
    back: jest.fn(),
    cancel: jest.fn(),
    ...over,
  } as unknown as ImportState;
}

async function renderStep(state: ImportState) {
  return await render(
    <ThemeProvider>
      <ReviewStep state={state} />
    </ThemeProvider>
  );
}

describe('wallet preview', () => {
  it('shows the reader chip and the owner-worded new-accounts title, every switch off and Create disabled', async () => {
    await renderStep(stateFor(wise()));
    expect(screen.getByText('Wise file')).toBeTruthy();
    expect(screen.getByText("This file has EUR and GBP balances. Create 'Wise EUR' and 'Wise GBP'?")).toBeTruthy();
    for (const name of ['Wise EUR', 'Wise GBP']) {
      expect(screen.getByRole('switch', { name }).props.accessibilityState.checked).toBe(false);
    }
    expect(screen.getByRole('button', { name: 'Create selected accounts' }).props.accessibilityState.disabled).toBe(true);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('a switch tap only records the choice; accounts are made only on Create selected accounts', async () => {
    mockAdd.mockClear();
    const state = stateFor(wise(), { create: new Set(['GBP']) });
    await renderStep(state);
    await fireEvent.press(screen.getByRole('switch', { name: 'Wise EUR' }));
    expect(state.setWalletCreate).toHaveBeenCalledWith('EUR', true);
    expect(mockAdd).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Create selected accounts' }));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0]?.[0]).toMatchObject({ name: 'Wise GBP', currency: 'GBP', household_id: 'h1', opening_balance: 0 });
    expect(state.linkWalletAccount).toHaveBeenCalledWith('GBP', 'new-account-id');
  });

  it('holds back lines for a currency with no account, and Choose turns that currency\'s switch on', async () => {
    const state = stateFor(wise(), { link: new Map([['EUR', 'a-eur']]) });
    await renderStep(state);
    expect(screen.getByText('Not imported: no account yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose' }));
    expect(state.setWalletCreate).toHaveBeenCalledWith('GBP', true);
  });

  it('shows a fee as its own row under the payment, the Fees note, the summary and the pinned Import pill', async () => {
    await renderStep(stateFor(wise(), { link: new Map([['EUR', 'a-eur'], ['GBP', 'g']]) }));
    expect(screen.getByText(/^Fee .*0\.30.* · Fees$/)).toBeTruthy();
    expect(screen.getByText('Fees are saved as separate expenses in a Fees category. The account balance still matches the file.')).toBeTruthy();
    expect(screen.getByText('2 lines · 1 fees · 0 conversions · 0 new accounts')).toBeTruthy();
    const importPill = screen.getByRole('button', { name: 'Import 2 lines' });
    expect(importPill.props.accessibilityState.disabled).toBeFalsy();
    await fireEvent.press(importPill);
  });

  it('disables Import while a switched-on currency still waits for its account', async () => {
    await renderStep(stateFor(wise(), { link: new Map([['EUR', 'a-eur']]), create: new Set(['GBP']) }));
    expect(screen.getByRole('button', { name: 'Import 2 lines' }).props.accessibilityState.disabled).toBe(true);
  });

  it('shows a conversion as one row with its fee beneath and lets the person unlink it', async () => {
    const d = revolut();
    const state = stateFor(d, { link: new Map([['EUR', 'a-eur'], ['GBP', 'g']]) });
    await renderStep(state);
    expect(screen.getAllByTestId('wallet-conversion')).toHaveLength(1);
    expect(screen.getByText(/^Converted .*100.* to .*85\.10.*$/)).toBeTruthy();
    expect(screen.getByText(/^Fee .*0\.50.* · Fees$/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep as separate lines' }));
    expect(state.toggleWalletConversion).toHaveBeenCalledWith(d.transferPairs[0]?.fromIndex);
  });

  it('a file that matches a reader but misses a column offers the generic import', async () => {
    const state = stateFor(wise(), {}, { wallet: null, walletError: 'wise', walletPlan: null } as Partial<ImportState>);
    await renderStep(state);
    expect(screen.getByText('This Wise file is missing a column FincWin reads. Use the generic import instead.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Match columns' }));
    expect(state.matchWalletColumns).toHaveBeenCalled();
  });
});
