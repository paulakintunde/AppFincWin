// D-75: shows the step 3 hint until the first fold or details tap, once per user per device.
// The load result is set inside the promise callback (never synchronously in the effect body).
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFoldHintSeen, markFoldHintSeen } from './decideHints';

export interface FoldHintState {
  visible: boolean;
  dismiss: () => void;
}

interface Loaded {
  userId: string;
  seen: boolean;
}

export function useFoldHint(userId: string | null): FoldHintState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const wroteFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    void loadFoldHintSeen(userId).then((seen) => {
      if (live) setLoaded({ userId, seen });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    if (!userId) return;
    setDismissedFor(userId);
    if (wroteFor.current === userId) return;
    wroteFor.current = userId;
    void markFoldHintSeen(userId);
  }, [userId]);

  const visible = userId !== null && loaded?.userId === userId && !loaded.seen && dismissedFor !== userId;
  return { visible, dismiss };
}
