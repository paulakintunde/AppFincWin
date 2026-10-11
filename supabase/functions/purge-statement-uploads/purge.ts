// D-12 backstop: removes stale statement uploads through the Storage API only
// (a SQL DELETE on storage.objects would orphan the file). Logs counts only.
export const PURGE_BATCH = 100;
export const PURGE_MAX_BATCHES = 10;

export interface PurgeDeps {
  listStale(limit: number): Promise<string[]>;
  remove(names: string[]): Promise<number>;
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
    deps.log(
      JSON.stringify({ fn: 'purge-statement-uploads', outcome, removed, batches, durationMs: deps.now() - start }),
    );
  try {
    while (batches < PURGE_MAX_BATCHES) {
      const names = await deps.listStale(PURGE_BATCH);
      if (names.length === 0) break;
      removed += await deps.remove(names);
      batches += 1;
      if (names.length < PURGE_BATCH) break;
    }
  } catch {
    emit('storage');
    return { ok: false, error: 'storage' };
  }
  emit('ok');
  return { ok: true, removed, batches };
}
