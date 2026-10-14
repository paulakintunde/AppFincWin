// Record's registration with the shell FAB (03-CONTEXT D-09, D-11, HOME-01): 'Add' opens a new
// transaction; the quick menu gets Add expense, Add income, Transfer and Import statement. One
// G3: Import statement carries its origin (from=home on Home, else activity) so finishing returns there.
// TransactionSheet for every app-wide entry point, driven by the entry-host store. Mounted once in
// the tabs layout. 'New check' stays absent until Decide registers it.
import React, { useCallback } from 'react';
import { type Href } from 'expo-router';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useHideFab, useProvideDefaultFabAction, useProvideQuickAction } from '@/shell/fab/FabProvider';
import { closeEntry, openEntry, useEntryHostMode } from './entryHost';
import { TransactionSheet } from './TransactionSheet';
import type { EntryMode } from './transactionForm';

const NEW_OUT: EntryMode = { kind: 'new', direction: 'out' };

export function ShellEntryHost(): React.JSX.Element {
  const mode = useEntryHostMode();
  const { current } = useBackHistory();
  const from = current?.area === 'tab' && current.tab === 'home' ? 'home' : 'activity';
  const openNew = useCallback((direction: 'out' | 'in' | 'transfer') => openEntry({ kind: 'new', direction }), []);
  useProvideDefaultFabAction(useCallback(() => openNew('out'), [openNew]));
  useProvideQuickAction('addExpense', useCallback(() => openNew('out'), [openNew]));
  useProvideQuickAction('addIncome', useCallback(() => openNew('in'), [openNew]));
  useProvideQuickAction('transfer', useCallback(() => openNew('transfer'), [openNew]));
  useProvideQuickAction(
    'importStatement',
    useCallback(() => pushOnce({ pathname: '/import', params: { entry: 'you', from } } as Href), [from]),
  );
  useHideFab('entryFlow', mode !== null);
  return <TransactionSheet visible={mode !== null} mode={mode ?? NEW_OUT} onClose={closeEntry} />;
}
