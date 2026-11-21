// 05-21: Decide's registration with the shell quick menu (03 D-09): 'New check' opens a new purchase
// check. Mounted once in the tabs layout beside ShellEntryHost. Decide home has no FAB of its own (05-117, D-98); this
// host owns the quick-menu entry (and You > Add > New check), which is available from every tab.
import React, { useCallback } from 'react';
import { useProvideQuickAction } from '@/shell/fab/FabProvider';
import type { Href } from 'expo-router';
import { useWriteGate } from '@/features/plans/useWriteGate';
import { pushOnce } from '@/shell/navigation/pushOnce';

export function DecideShellHost(): React.JSX.Element | null {
  // 09-17 (D-02): locked Decide starts no new check for anyone; the sheet names the action instead.
  const { run } = useWriteGate('newDecideCheck');
  useProvideQuickAction('newCheck', useCallback(() => run(() => pushOnce('/decide?focus=check' as Href)), [run]));
  return null;
}
