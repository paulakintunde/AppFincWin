// 05.4 BO-08 (D-10, D-11, D-13, D-145): the quiet shadow run on a tester's phone. Only for profiles.decide_shadow (the server
// also refuses the insert without it, 05.4-30). Once per engine revision: the 6 fixed samples are judged on the tester's own
// inputs (prepare once, judgeCheck x 6, in the engine's shadowRun) and only the rounded rows are sent. Nothing is shown and
// nothing is thrown: every failure is reported without amounts and tried again on a later app open.
import { DECIDE_ENGINE_REVISION, shadowRun, type V3Inputs } from '@/engine/decide/v3';
import { DbError } from '@/db/errors';
import type { ShadowRunRow } from '@/db/decideShadowRuns';
import { STORAGE_PREFIX } from '@/services/storage/wipe';

/** D-145: records not up to date are retried on each app open for up to this many days from the first try, then sent marked. */
export const SHADOW_WAIT_DAYS = 7;

/** Under the fincwin: prefix, so the sign-out wipe clears it and the next tester on this phone runs again. */
export const sentKey = (revision: string): string => `${STORAGE_PREFIX}decide-shadow-sent:${revision}`;
export const waitKey = (revision: string): string => `${STORAGE_PREFIX}decide-shadow-wait:${revision}`;

export interface ShadowStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ShadowReporter {
  /** A refused insert: its code only (no rows, no amounts). */
  failedWrite(code: string): void;
  /** Anything else: reported with a fixed message. */
  failed(): void;
}

export interface RunShadowDeps {
  /** profiles.decide_shadow. */
  readonly enabled: boolean;
  readonly userId: string;
  readonly inputs: V3Inputs;
  readonly online: () => boolean;
  readonly storage: ShadowStorage;
  readonly insert: (rows: readonly ShadowRunRow[]) => Promise<void>;
  readonly report: ShadowReporter;
  /** Defaults to DECIDE_ENGINE_REVISION (tests pass another). */
  readonly revision?: string;
}

export type ShadowOutcome = 'off' | 'already_sent' | 'offline' | 'waiting' | 'sent' | 'failed';

/** The rows one run sends, in sample order. */
export function shadowRowsFor(inputs: V3Inputs, userId: string, revision: string = DECIDE_ENGINE_REVISION): { readonly ready: boolean; readonly rows: ShadowRunRow[] } {
  const run = shadowRun(inputs);
  const rows = run.answers.map((a) => ({
    user_id: userId,
    engine_revision: revision,
    sample_id: a.sampleId,
    code: a.round.code,
    variant: a.round.variant,
    reasons: [...a.round.reasons],
    figures: { ...a.round.figures },
  }));
  return { ready: run.ready, rows };
}

function dayNumber(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;
}

/** D-145: true while records that are not up to date may still be waited for (the first try's day is stored). */
async function stillWaiting(storage: ShadowStorage, revision: string, today: string): Promise<boolean> {
  const key = waitKey(revision);
  const first = await storage.getItem(key);
  if (first === null) {
    await storage.setItem(key, today);
    return true;
  }
  return dayNumber(today) - dayNumber(first) < SHADOW_WAIT_DAYS;
}

export async function runShadow(deps: RunShadowDeps): Promise<ShadowOutcome> {
  if (!deps.enabled) return 'off';
  const revision = deps.revision ?? DECIDE_ENGINE_REVISION;
  try {
    if ((await deps.storage.getItem(sentKey(revision))) !== null) return 'already_sent';
    if (!deps.online()) return 'offline';
    const { ready, rows } = shadowRowsFor(deps.inputs, deps.userId, revision);
    if (!ready && (await stillWaiting(deps.storage, revision, deps.inputs.asOf))) return 'waiting';
    try {
      await deps.insert(rows);
    } catch (err) {
      deps.report.failedWrite(err instanceof DbError ? err.code : 'unknown');
      return 'failed';
    }
    await deps.storage.setItem(sentKey(revision), deps.inputs.asOf);
    return 'sent';
  } catch {
    deps.report.failed();
    return 'failed';
  }
}
