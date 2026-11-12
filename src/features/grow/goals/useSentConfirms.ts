// P4-WR-05 (screen guard): a Confirm the user already sent is not offered again while the goal lines still show that same line
// as Expected (until the server answers, or for as long as the write waits offline). The line's version is kept with the id:
// once the lines show the line confirmed, or show it again at a new version (an Undo put it back), Confirm is offered again.
import { useCallback, useMemo, useState } from 'react';
import type { TransactionRow } from '@/db/rows';

export function useSentConfirms(lines: readonly TransactionRow[] | undefined): {
  sent: ReadonlySet<string>;
  markSent: (line: TransactionRow) => void;
} {
  const [sentAt, setSentAt] = useState<ReadonlyMap<string, number>>(() => new Map());
  const markSent = useCallback((line: TransactionRow) => setSentAt((m) => new Map(m).set(line.id, line.version)), []);
  const sent = useMemo(() => {
    const out = new Set<string>();
    if (sentAt.size === 0) return out;
    for (const l of lines ?? []) {
      if (l.status === 'pending' && l.deleted_at === null && sentAt.get(l.id) === l.version) out.add(l.id);
    }
    return out;
  }, [lines, sentAt]);
  return { sent, markSent };
}
