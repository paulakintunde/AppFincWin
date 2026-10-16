// 05-21: Decide's registration with the shell quick menu (03 D-09): 'New check' opens a new purchase
// check. Mounted once in the tabs layout beside ShellEntryHost. The FAB label on Decide is set by the
// Decide screen itself; this host only owns the quick-menu entry, which is available from every tab.
import React, { useCallback } from 'react';
import { useProvideQuickAction } from '@/shell/fab/FabProvider';
import { openNewCheck } from './home/checkHref';

export function DecideShellHost(): React.JSX.Element | null {
  useProvideQuickAction('newCheck', useCallback(() => openNewCheck('buy'), []));
  return null;
}
