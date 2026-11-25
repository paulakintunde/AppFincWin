// 10.1-17 (D-09): the receipts of one line that are still on the phone (waiting, or failed and ready to retry or remove).
// Local files are not server data, so this reads the outbox directly and re-reads whenever it changes; no React Query.
import { useEffect, useState } from 'react';
import { listOutbox, subscribeOutbox, type OutboxItem } from '@/services/receipts/outbox';

export function useReceiptOutbox(transactionId: string | null | undefined): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    if (!transactionId) return;
    let alive = true;
    const read = () => {
      listOutbox(transactionId)
        .then((list) => {
          if (alive) setItems(list);
        })
        .catch(() => undefined);
    };
    read();
    const off = subscribeOutbox(read);
    return () => {
      alive = false;
      off();
    };
  }, [transactionId]);
  return transactionId ? items : [];
}
