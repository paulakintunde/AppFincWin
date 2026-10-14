// Record's registration with the shell FAB (03-CONTEXT D-09, D-11, HOME-01): 'Add' opens a new
// transaction; the quick menu gets Add expense, Add income, Transfer and Import statement. One
// TransactionSheet for every app-wide entry point, driven by the entry-host store. Mounted once in
// the tabs layout. 'New check' stays absent until Decide registers it.
import React, { useCallback } from 'react';
import { router, type Href } from 'expo-router';
import { useHideFab, useProvideDefaultFabAction, useProvideQuickAction } from '@/shell/fab/FabProvider';
import { closeEntry, openEntry, useEntryHostMode } from './entryHost';
import { TransactionSheet } from './TransactionSheet';
import type { EntryMode } from './transactionForm';

const NEW_OUT: EntryMode = { kind: 'new', direction: 'out' };

export function ShellEntryHost(): React.JSX.Element {
  const mode = useEntryHostMode();
  const openNew = useCallback((direction: 'out' | 'in' | 'transfer') => openEntry({ kind: 'new', direction }), []);
  useProvideDefaultFabAction(useCallback(() => openNew('out'), [openNew]));
  useProvideQuickAction('addExpense', useCallback(() => openNew('out'), [openNew]));
  useProvideQuickAction('addIncome', useCallback(() => openNew('in'), [openNew]));
  useProvideQuickAction('transfer', useCallback(() => openNew('transfer'), [openNew]));
  useProvideQuickAction(
    'importStatement',
    useCallback(() => router.push({ pathname: '/import', params: { entry: 'you' } } as Href), []),
  );
  useHideFab('entryFlow', mode !== null);
  return <TransactionSheet visible={mode !== null} mode={mode ?? NEW_OUT} onClose={closeEntry} />;
}
