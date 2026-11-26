// Record's registration with the shell FAB (03-CONTEXT D-09, D-11, HOME-01): 'Add' opens a new
// transaction; the quick menu gets Add expense, Add income, Transfer and Import statement. One
// G3: Import statement carries its origin (from=home on Home, else activity) so finishing returns there.
// TransactionSheet for every app-wide entry point, driven by the entry-host store. Mounted once in
// the tabs layout. 'New check' stays absent until Decide registers it.
// 10.1-25 (D-13): at level 2 (receipts on) the quick menu and You > Add also get "Scan a receipt", behind the same add gate.
import React, { useCallback, useState } from 'react';
import { type Href } from 'expo-router';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useHideFab, useProvideDefaultFabAction, useProvideQuickAction } from '@/shell/fab/FabProvider';
import { useWriteGate } from '@/features/plans/useWriteGate';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { ScanEntryFlow } from '@/features/record/receipt/ScanEntryFlow';
import { closeEntry, openEntry, useEntryHostMode } from './entryHost';
import { SeriesStatusHost } from './SeriesStatusSheet';
import { TransactionSheet } from './TransactionSheet';
import type { EntryMode } from './transactionForm';

const NEW_OUT: EntryMode = { kind: 'new', direction: 'out' };

export function ShellEntryHost(): React.JSX.Element {
  const mode = useEntryHostMode();
  const { current } = useBackHistory();
  const from = current?.area === 'tab' && current.tab === 'home' ? 'home' : 'activity';
  // 09-17 (TIER-09): a locked plan opens the named sheet instead of the entry; the quick menu, You > Add and the
  // screen-reader actions all call these handlers, so the gate lives here.
  const addGate = useWriteGate('addTransaction');
  const importGate = useWriteGate('importStatement');
  const addRun = addGate.run;
  const importRun = importGate.run;
  const openNew = useCallback(
    (direction: 'out' | 'in' | 'transfer') => addRun(() => openEntry({ kind: 'new', direction })),
    [addRun],
  );
  useProvideDefaultFabAction(useCallback(() => openNew('out'), [openNew]));
  useProvideQuickAction('addExpense', useCallback(() => openNew('out'), [openNew]));
  useProvideQuickAction('addIncome', useCallback(() => openNew('in'), [openNew]));
  useProvideQuickAction('transfer', useCallback(() => openNew('transfer'), [openNew]));
  // A scan ends in a new line, so a locked or sample plan names adding a transaction (T-10.1-25-02). Below level 2 the
  // entry is not registered, so neither the quick menu nor You > Add shows it.
  const receiptsOn = useFeatureAccess('receipts').visible;
  const [scanOpen, setScanOpen] = useState(false);
  const startScan = useCallback(() => addRun(() => setScanOpen(true)), [addRun]);
  const closeScan = useCallback(() => setScanOpen(false), []);
  useProvideQuickAction('scanReceipt', receiptsOn ? startScan : null);
  useProvideQuickAction(
    'importStatement',
    useCallback(
      () => importRun(() => pushOnce({ pathname: '/import', params: { entry: 'you', from } } as Href)),
      [from, importRun],
    ),
  );
  useHideFab('entryFlow', mode !== null || scanOpen);
  return (
    <>
      <TransactionSheet visible={mode !== null} mode={mode ?? NEW_OUT} onClose={closeEntry} />
      <SeriesStatusHost />
      <ScanEntryFlow visible={scanOpen} onClose={closeScan} />
    </>
  );
}
