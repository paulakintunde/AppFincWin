// 05-21: Decide's registration with the shell quick menu (03 D-09): 'New check' opens a new purchase
// check. Mounted once in the tabs layout beside ShellEntryHost. Decide home has no FAB of its own (05-117, D-98); this
// host owns the quick-menu entry (and You > Add > New check), which is available from every tab.
import React, { useCallback } from 'react';
import { useProvideQuickAction } from '@/shell/fab/FabProvider';
import { openNewCheck } from './home/checkHref';

export function DecideShellHost(): React.JSX.Element | null {
  useProvideQuickAction('newCheck', useCallback(() => openNewCheck('buy'), []));
  return null;
}
