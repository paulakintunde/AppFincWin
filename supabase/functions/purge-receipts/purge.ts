// 10.1-12 (D-08, D-19, RCP-05): drains receipt_purge_queue and orphans; Storage API only (a SQL DELETE on storage.objects
// would orphan the file). A batch is acknowledged only after its files were removed. Logs counts only, never a path.
export const PURGE_BATCH = 100;
export const PURGE_MAX_BATCHES = 10;

export interface PurgeDeps {
  /** Paths waiting for deletion (queued and orphaned), at most `limit`. */
  listStale(limit: number): Promise<string[]>;
  remove(paths: string[]): Promise<number>;
  /** Tells the database these paths are gone, so they leave the queue. */
  ack(paths: string[]): Promise<void>;
  now(): number;
  log(line: string): void;
}

export type PurgeResult =
  | { ok: true; removed: number; batches: number }
  | { ok: false; error: 'storage' };

export async function runPurge(deps: PurgeDeps): Promise<PurgeResult> {
  const start = deps.now();
  let removed = 0;
  let batches = 0;
  const emit = (outcome: 'ok' | 'storage') =>
    deps.log(JSON.stringify({ fn: 'purge-receipts', outcome, removed, batches, durationMs: deps.now() - start }));
  try {
    while (batches < PURGE_MAX_BATCHES) {
      const paths = await deps.listStale(PURGE_BATCH);
      if (paths.length === 0) break;
      const n = await deps.remove(paths);
      // Only after the files are gone: a failed remove above leaves the batch queued for the next run.
      await deps.ack(paths);
      removed += n;
      batches += 1;
      if (paths.length < PURGE_BATCH) break;
    }
  } catch {
    emit('storage');
    return { ok: false, error: 'storage' };
  }
  emit('ok');
  return { ok: true, removed, batches };
}
