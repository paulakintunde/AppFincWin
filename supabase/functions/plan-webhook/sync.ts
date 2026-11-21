// 09-06 (D-13): the webhook is a doorbell. Store the event once, then re-fetch the subscriber from RevenueCat and hand a
// normalised snapshot to plan_apply. State never comes from event.type, so late or reordered events cannot roll it back.
// Every effect is injected, so this runs without a network. Logs carry the event type and result only, never the payload.
import { isUuid, scrubEvent, toSnapshot, type PlanSnapshot } from '../_shared/revenuecat/subscriber.ts';

export interface SyncDeps {
  insertEvent(e: {
    id: string;
    type: string;
    appUserId: string | null;
    environment: string | null;
    payload: Record<string, unknown>;
  }): Promise<'new' | 'duplicate' | 'unapplied'>;
  fetchSubscriber(appUserId: string): Promise<unknown>;
  applyPlan(appUserId: string, snapshot: PlanSnapshot, eventId: string): Promise<unknown>;
  markNote(eventId: string, note: string): Promise<void>;
  now(): number;
  log(l: Record<string, unknown>): void;
}

export interface SyncResult {
  ok: boolean;
  result: string;
  retry?: boolean;
}

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export async function processEvent(deps: SyncDeps, body: unknown): Promise<SyncResult> {
  const event = asRec(asRec(body).event);
  const id = event.id;
  const type = event.type;
  if (typeof id !== 'string' || id === '' || typeof type !== 'string') {
    deps.log({ fn: 'plan-webhook', result: 'bad_event' });
    return { ok: false, result: 'bad_event' };
  }

  const isTransfer = type === 'TRANSFER';
  const candidates: unknown[] = [event.app_user_id, event.original_app_user_id, ...asList(event.aliases)];
  const targets: string[] = isTransfer
    ? [...asList(event.transferred_from), ...asList(event.transferred_to)].filter(isUuid)
    : [candidates.find(isUuid)].filter(isUuid);
  const uniqueTargets = [...new Set(targets)];

  try {
    const stored = await deps.insertEvent({
      id,
      type,
      appUserId: uniqueTargets[0] ?? (typeof event.app_user_id === 'string' ? event.app_user_id : null),
      environment: typeof event.environment === 'string' ? event.environment : null,
      payload: scrubEvent(event),
    });
    // Only an event whose first run finished is skipped; one that never finished is processed again (plan_apply is idempotent).
    if (stored === 'duplicate') {
      deps.log({ fn: 'plan-webhook', type, result: 'duplicate' });
      return { ok: true, result: 'duplicate' };
    }

    if (type === 'TEST') {
      await deps.markNote(id, 'test');
      deps.log({ fn: 'plan-webhook', type, result: 'test' });
      return { ok: true, result: 'test' };
    }
    if (uniqueTargets.length === 0) {
      await deps.markNote(id, 'anonymous');
      deps.log({ fn: 'plan-webhook', type, result: 'anonymous' });
      return { ok: true, result: 'anonymous' };
    }

    for (const uid of uniqueTargets) {
      const subscriber = await deps.fetchSubscriber(uid);
      await deps.applyPlan(uid, toSnapshot(subscriber, deps.now()), id);
    }
    deps.log({ fn: 'plan-webhook', type, result: 'applied' });
    return { ok: true, result: 'applied' };
  } catch {
    deps.log({ fn: 'plan-webhook', type, result: 'error' });
    return { ok: false, result: 'error', retry: true };
  }
}
