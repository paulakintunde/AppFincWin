// 10.1-23 (D-09): the lines that still have a receipt on the phone (waiting to upload, or failed and waiting for Try again or
// Remove), so Activity can say "Receipt waiting to upload" on their rows. Local files are not server data: this reads the
// outbox directly and re-reads on its change emitter, like useReceiptOutbox. No React Query.
import { useEffect, useState } from 'react';
import { listOutbox, subscribeOutbox } from '@/services/receipts/outbox';

const EMPTY: ReadonlySet<string> = new Set();

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function useOutboxLineIds(enabled = true): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = () => {
      listOutbox()
        .then((items) => {
          if (!alive) return;
          const next = new Set(items.filter((i) => i.state === 'waiting' || i.state === 'failed').map((i) => i.transactionId));
          // A new Set every read would re-render every Activity row; keep the old one when nothing changed.
          setIds((prev) => (sameIds(prev, next) ? prev : next));
        })
        .catch(() => undefined);
    };
    read();
    const off = subscribeOutbox(read);
    return () => {
      alive = false;
      off();
    };
  }, [enabled]);
  return enabled ? ids : EMPTY;
}
