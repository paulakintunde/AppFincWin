// 06.2-14 (L06): which 16 icon the undo toast shows. Kept apart from UndoToastHost so it can be tested without the
// host's data modules.
import type { ToastState } from '@/state/undoToast';
import type { IconName } from '@/ui/icons/iconData';

/** 06.2-14: the saved-offline toast's text key (appLife.toast.savedOffline); an info toast with it shows the offline icon. */
export const SAVED_OFFLINE_TOAST_KEY = 'appLife.toast.savedOffline';

/**
 * 06.2-14 (L06): the toast's 16 icon. The cap warning tone wins over the kind; an info toast shows an icon only when it
 * is the saved-offline one.
 */
export function toastIconFor(toast: Pick<ToastState, 'kind' | 'tone' | 'text'>): IconName | undefined {
  if (toast.tone === 'warning') return 'stateOverCap';
  switch (toast.kind) {
    case 'ordinary':
      return 'stateFits';
    case 'destructive':
      return 'delete';
    case 'refusal':
      return 'stateDue';
    case 'info':
      return toast.text?.key === SAVED_OFFLINE_TOAST_KEY ? 'savedOffline' : undefined;
  }
}
