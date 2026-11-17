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
