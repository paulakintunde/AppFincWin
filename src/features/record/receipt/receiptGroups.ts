// 10.1-21 (D-06, D-09): the receipts of one line as the person sees them: one group per photo, file or scan (a scan's pages share
// a group), stored ones first, then the ones still on the phone. Pure: server rows and outbox items go in, groups come out.
import type { ReceiptRow } from '@/db/receipts';
import type { OutboxItem } from '@/services/receipts/types';

export interface ReceiptGroup {
  groupId: string;
  kind: 'photo' | 'file' | 'scan';
  pages: { objectPath: string | null; localUri: string | null; mime: string }[];
  state: 'stored' | 'waiting' | 'failed';
  createdAt: string;
}

interface Draft extends ReceiptGroup {
  pageNos: number[];
}

function byCreated(a: ReceiptGroup, b: ReceiptGroup): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function finish(drafts: Draft[]): ReceiptGroup[] {
  return drafts.map((d) => {
    const order = d.pageNos.map((n, i) => i).sort((a, b) => d.pageNos[a]! - d.pageNos[b]!);
    return { groupId: d.groupId, kind: d.kind, pages: order.map((i) => d.pages[i]!), state: d.state, createdAt: d.createdAt };
  });
}

export function receiptGroups(rows: readonly ReceiptRow[], outbox: readonly OutboxItem[]): ReceiptGroup[] {
  const stored = new Map<string, Draft>();
  for (const r of rows) {
    let g = stored.get(r.group_id);
    if (g === undefined) {
      g = { groupId: r.group_id, kind: r.kind, pages: [], pageNos: [], state: 'stored', createdAt: r.created_at };
      stored.set(r.group_id, g);
    }
    g.pages.push({ objectPath: r.object_path, localUri: null, mime: r.mime_type });
    g.pageNos.push(r.page_no);
    if (r.created_at < g.createdAt) g.createdAt = r.created_at;
  }
  const waiting = new Map<string, Draft>();
  for (const o of outbox) {
    let g = waiting.get(o.groupId);
    if (g === undefined) {
      g = { groupId: o.groupId, kind: o.kind, pages: [], pageNos: [], state: 'waiting', createdAt: o.createdAt };
      waiting.set(o.groupId, g);
    }
    g.pages.push({ objectPath: null, localUri: o.localUri, mime: o.mime });
    g.pageNos.push(o.pageNo);
    if (o.state === 'failed') g.state = 'failed';
    if (o.createdAt < g.createdAt) g.createdAt = o.createdAt;
  }
  return [...finish([...stored.values()]).sort(byCreated), ...finish([...waiting.values()]).sort(byCreated)];
}
