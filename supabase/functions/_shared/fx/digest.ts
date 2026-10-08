// Alert digest builder, shared by Edge Functions (resolve-rate). Zero imports
// so it loads identically under Deno and Jest.

export interface UnsentAlert {
  id: number;
  kind: string;
  quote: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/**
 * One digest email per run (T-01-11-04): the subject groups every unsent
 * alert by kind with a count, and the body lists each alert's quote and
 * detail. Currency codes, rates, dates and counts only -- never a user
 * identifier, household id or amount.
 */
export function buildDigest(alerts: UnsentAlert[]): { subject: string; text: string } {
  const counts = new Map<string, number>();
  for (const a of alerts) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);

  const subject = `FincWin FX: ${[...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(', ')}`;
  const text = alerts.map((a) => `[${a.kind}] ${a.quote ?? '-'} ${JSON.stringify(a.detail)}`).join('\n');

  return { subject, text };
}
