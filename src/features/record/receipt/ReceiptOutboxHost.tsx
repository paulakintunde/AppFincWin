// 10.1-17 (D-09): drains the receipt upload outbox when the app opens, returns to the foreground, comes back online, and after
// the paused writes have replayed (a receipt for a line made offline can only go once that line is on the server).
// Renders nothing. Mounted in the (app) layout beside the other hosts.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { drainOutbox } from '@/services/receipts/outbox';

export function ReceiptOutboxHost() {
  const qc = useQueryClient();
  useEffect(() => {
    let alive = true;
    const run = () => {
      void qc
        .resumePausedMutations()
        .catch(() => undefined)
        .then(() => drainOutbox())
        .then((r) => {
          if (!alive) return;
          for (const transactionId of new Set(r.uploadedTransactionIds)) {
            void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'receipts' && q.queryKey[2] === transactionId });
          }
        })
        .catch(() => undefined);
    };
    run();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    const offOnline = onlineManager.subscribe((online) => {
      if (online) run();
    });
    return () => {
      alive = false;
      appSub.remove();
      offOnline();
    };
  }, [qc]);
  return null;
}
