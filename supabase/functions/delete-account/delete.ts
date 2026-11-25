// 08-22 (D-40, HH-14): the account deletion rule with every effect injected, so it is tested without a network.
//
// The caller is whoever the verified JWT says it is (deps.getCallerId, from auth.getUser()). The request body is never read:
// a client cannot name another user (T-08-78). The auth user is deleted through the Admin API; the before-delete trigger
// from plan 08-14 then runs the household rule (owner hand-off, personal data erased, shared lines kept as Former member).
// Storage objects the caller uploaded are removed first, because deleting the user does not delete Storage files.
// Any failure answers 500 and nothing is reported as done (T-08-80).

export interface StorageObject {
  bucket: string;
  path: string;
}

export interface DeleteDeps {
  getCallerId(): Promise<string | null>;
  listUserStorageObjects(userId: string): Promise<StorageObject[]>;
  removeStorageObjects(objects: StorageObject[]): Promise<void>;
  deleteAuthUser(userId: string): Promise<{ error: string | null }>;
}

export interface DeleteRequest {
  method: string;
  /** Present only so a test can prove it is ignored. */
  body?: unknown;
}

export interface DeleteResponse {
  status: number;
  body: { ok: boolean; error?: string };
}

export async function deleteAccount(req: DeleteRequest, deps: DeleteDeps): Promise<DeleteResponse> {
  if (req.method !== 'POST') return { status: 405, body: { ok: false, error: 'method' } };

  let callerId: string | null;
  try {
    callerId = await deps.getCallerId();
  } catch {
    callerId = null;
  }
  if (!callerId) return { status: 401, body: { ok: false, error: 'unauthorized' } };

  try {
    const objects = await deps.listUserStorageObjects(callerId);
    if (objects.length > 0) await deps.removeStorageObjects(objects);
    const { error } = await deps.deleteAuthUser(callerId);
    if (error) return { status: 500, body: { ok: false, error: 'delete_failed' } };
  } catch {
    return { status: 500, body: { ok: false, error: 'delete_failed' } };
  }
  return { status: 200, body: { ok: true } };
}

// 10.1-12 (D-19, RCP-05): the receipt files to delete with an account are listed from transaction_receipts rows, never from
// storage.list(userId): a user's folder also holds files of shared lines, and those stay with the household whoever uploaded them.
// Only receipts on the leaving user's own private lines (created_by = user, is_shared = false) go. The query is made in index.ts;
// the rows are checked again here so a wrong query can only ever delete less, never a shared line's file.
export const RECEIPT_BUCKET = 'receipts';
export const RECEIPT_PAGE = 1000;

export interface ReceiptRowWithLine {
  object_path: string | null;
  transactions: { created_by: string | null; is_shared: boolean } | { created_by: string | null; is_shared: boolean }[] | null;
}

export type ReceiptPageFetcher = (
  from: number,
  to: number,
) => Promise<{ data: ReceiptRowWithLine[] | null; error: unknown }>;

export async function privateLineReceiptObjects(fetchPage: ReceiptPageFetcher, userId: string): Promise<StorageObject[]> {
  const out: StorageObject[] = [];
  for (let from = 0; ; from += RECEIPT_PAGE) {
    const { data, error } = await fetchPage(from, from + RECEIPT_PAGE - 1);
    if (error) throw new Error('storage');
    const rows = data ?? [];
    for (const r of rows) {
      const line = Array.isArray(r.transactions) ? r.transactions[0] : r.transactions;
      if (!r.object_path || !line || line.created_by !== userId || line.is_shared !== false) continue;
      out.push({ bucket: RECEIPT_BUCKET, path: r.object_path });
    }
    if (rows.length < RECEIPT_PAGE) break;
  }
  return out;
}
