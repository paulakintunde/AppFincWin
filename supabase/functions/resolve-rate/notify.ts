// Throttled operator email (02-44, decision item 7). resolve-rate calls this
// at the end of a request that wrote a failure, hold or auto-accept alert.
// Pure orchestration over injected deps so it loads under Deno and Jest;
// the only import is the shared digest builder. It never throws: an email
// failure must never fail the user's call, and unsent alerts simply stay
// queued for the next eligible request.
import { buildDigest, type UnsentAlert } from '../_shared/fx/digest.ts';

export const EMAIL_MIN_INTERVAL_MINUTES = 60;

export interface NotifyDeps {
  now(): Date;
  /** Latest non-null fx_alerts.emailed_at, ISO string. */
  lastEmailedAt(): Promise<string | null>;
  unsentAlerts(): Promise<UnsentAlert[]>;
  markEmailed(ids: number[]): Promise<void>;
  sendEmail(subject: string, text: string): Promise<void>;
  /** All Resend secrets present. When false nothing is read and alerts stay queued. */
  configured(): boolean;
}

export async function notifyOperator(deps: NotifyDeps): Promise<{ emailed: number }> {
  try {
    if (!deps.configured()) return { emailed: 0 };

    const last = await deps.lastEmailedAt();
    if (last !== null) {
      const ageMs = deps.now().getTime() - new Date(last).getTime();
      if (ageMs < EMAIL_MIN_INTERVAL_MINUTES * 60_000) return { emailed: 0 };
    }

    const alerts = await deps.unsentAlerts();
    if (alerts.length === 0) return { emailed: 0 }; // no heartbeat email

    const { subject, text } = buildDigest(alerts);
    await deps.sendEmail(subject, text);
    await deps.markEmailed(alerts.map((a) => a.id));
    return { emailed: alerts.length };
  } catch {
    return { emailed: 0 };
  }
}
