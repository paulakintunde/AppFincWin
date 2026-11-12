// 06-37: which goal a pending line pays into. Pure, no imports, so screens and tests can read it without the data layer.
export interface GoalLineFields {
  goal_id?: string | null;
  recurring_series_id: string | null;
}

/** The goal a line pays into: its own tag, else its series' goal (a tag not yet on this device). Null for a plain line. */
export function goalIdOfLine(row: GoalLineFields, seriesById?: ReadonlyMap<string, { goal_id?: string | null }>): string | null {
  if (row.goal_id) return row.goal_id;
  if (!row.recurring_series_id) return null;
  return seriesById?.get(row.recurring_series_id)?.goal_id ?? null;
}
