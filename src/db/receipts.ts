// 10.1-11 (RCP-01, RCP-06, D-08): receipt rows for a line and the wrappers for the 10.1-06 RPCs. The files live in the private
// `receipts` bucket; signed links to them are made on demand by the screen and are never stored (not in these rows, not in the cache).
// The server owns the rules (5 receipts per line, 10 pages per receipt, who may see a line); a refusal comes back as { ok: false, reason }.

import { toDbError } from './errors';
import { callRpc, type RpcResult } from './householdMembers';
import type { DbClient } from './rows';

export type ReceiptKind = 'photo' | 'file' | 'scan';

export interface ReceiptRow {
  id: string;
  transaction_id: string;
  household_id: string;
  /** Pages of one receipt share a group id. */
  group_id: string;
  page_no: number;
  uploaded_by: string | null;
  object_path: string;
  kind: ReceiptKind;
  mime_type: string;
  bytes: number;
  created_at: string;
}

export const RECEIPT_COLUMNS =
  'id, transaction_id, household_id, group_id, page_no, uploaded_by, object_path, kind, mime_type, bytes, created_at';

/** Ids per request, so the `in` list stays well under the URL limit. */
const RECEIPT_ID_CHUNK = 100;

/** Receipt rows for the given lines, oldest first, pages in order. No ids, no request. */
export async function listReceipts(client: DbClient, transactionIds: readonly string[]): Promise<ReceiptRow[]> {
  if (transactionIds.length === 0) return [];
  const rows: ReceiptRow[] = [];
  for (let i = 0; i < transactionIds.length; i += RECEIPT_ID_CHUNK) {
    const chunk = transactionIds.slice(i, i + RECEIPT_ID_CHUNK);
    const { data, error, status } = await client
      .from('transaction_receipts')
      .select(RECEIPT_COLUMNS)
      .in('transaction_id', chunk)
      .order('created_at', { ascending: true })
      .order('page_no', { ascending: true });
    if (error) throw toDbError(error, status);
    rows.push(...((data as ReceiptRow[] | null) ?? []));
  }
  return rows;
}

/** The storage path a new receipt file must be uploaded to, or null when the caller may not add one to this line. */
export async function receiptObjectPath(client: DbClient, id: string, transactionId: string, mime: string): Promise<string | null> {
  const { data, error, status } = await client.rpc('receipt_object_path', {
    p_id: id,
    p_transaction: transactionId,
    p_mime: mime,
  });
  if (error) throw toDbError(error, status);
  return (data as string | null) ?? null;
}

export interface AddReceiptArgs {
  id: string;
  transactionId: string;
  groupId: string;
  pageNo: number;
  kind: ReceiptKind;
  mime: string;
  bytes: number;
}

/**
 * Records an uploaded file against a line. Success returns object_path and `already` (a replay of the same id).
 * Refusals: not_found, bad_type, too_big, too_many_receipts, too_many_pages, object_missing (the file was not uploaded yet).
 */
export function addReceipt(client: DbClient, a: AddReceiptArgs): Promise<RpcResult<{ object_path?: string; already?: boolean }>> {
  return callRpc<{ object_path?: string; already?: boolean }>(client, 'add_receipt', {
    p_id: a.id,
    p_transaction: a.transactionId,
    p_group_id: a.groupId,
    p_page_no: a.pageNo,
    p_kind: a.kind,
    p_mime: a.mime,
    p_bytes: a.bytes,
  });
}

/** Removes every page of one receipt; the files go through the purge queue. Refusal: not_found. */
export function removeReceipt(client: DbClient, groupId: string): Promise<RpcResult<{ transaction_id?: string; removed?: number }>> {
  return callRpc<{ transaction_id?: string; removed?: number }>(client, 'remove_receipt', { p_group_id: groupId });
}

/** Removes every receipt on a line. Refusal: not_found. */
export function removeAllReceipts(client: DbClient, transactionId: string): Promise<RpcResult<{ removed?: number }>> {
  return callRpc<{ removed?: number }>(client, 'remove_all_receipts', { p_transaction: transactionId });
}
