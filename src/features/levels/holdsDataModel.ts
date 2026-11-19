// Pure (no React or I/O). 09-22: sources to "holds your records" answers, one per probe in the registry (D-34).
// While a probe's source has not loaded it answers true: data is never hidden during a load (T-09-50).
import type { AccountRow, CategoryRow, DebtRow, SavingsGoalRow } from '@/db/rows';
import type { SplitDefaultRow } from '@/db/transactionSplits';
import { FEATURES } from './featureRegistry';

export type HoldsDataProbeId = NonNullable<(typeof FEATURES)[number]['holdsData']>;

/** Probes with no source. Empty since 09-22; a test keeps it so. */
export const UNSOURCED: readonly HoldsDataProbeId[] = [];

/** What each source returned; undefined means it has not loaded (the probe then answers true). */
export interface HoldsSources {
  accounts?: readonly Pick<AccountRow, 'currency' | 'archived_at' | 'deleted_at' | 'is_shared' | 'tombstone_of'>[];
  homeCurrency?: string;
  categories?: readonly Pick<CategoryRow, 'monthly_cap' | 'archived_at' | 'is_sample'>[];
  series?: readonly unknown[];
  goals?: readonly Pick<SavingsGoalRow, 'deleted_at' | 'is_safety_net' | 'monthly_amount'>[];
  debts?: readonly Pick<DebtRow, 'deleted_at' | 'payoff_extra' | 'payoff_order' | 'extra_series_id'>[];
  holdings?: readonly unknown[];
  lots?: readonly { deleted_at: string | null }[];
  periods?: readonly unknown[];
  refunds?: readonly unknown[];
  splitDefaults?: readonly Pick<SplitDefaultRow, 'category_ref'>[];
  settlements?: readonly unknown[];
  flags?: { transfers: boolean; importedLines: boolean; weightSplits: boolean; amountSplits: boolean };
}

/** Pure: sources to probe answers. */
export function deriveHolds(src: HoldsSources): Record<HoldsDataProbeId, boolean> {
  const out = {} as Record<HoldsDataProbeId, boolean>;
  for (const f of FEATURES) if (f.holdsData !== null) out[f.holdsData] = false;
  const live = src.accounts?.filter((a) => a.deleted_at === null && a.archived_at === null);
  const goals = src.goals?.filter((g) => g.deleted_at === null);
  const debts = src.debts?.filter((d) => d.deleted_at === null);

  out.recurringSeries = src.series === undefined ? true : src.series.length > 0;
  out.multipleAccounts = live === undefined ? true : live.length > 1;
  out.foreignCurrency =
    live === undefined || src.homeCurrency === undefined ? true : live.some((a) => a.currency !== src.homeCurrency);
  out.savingsGoals = goals === undefined ? true : goals.some((g) => g.is_safety_net !== true);
  out.debts = src.debts === undefined ? true : src.debts.length > 0;
  out.holdings = src.holdings === undefined ? true : src.holdings.length > 0;
  out.holdingLots = src.lots === undefined ? true : src.lots.some((l) => l.deleted_at === null);
  out.statementPeriods = src.periods === undefined ? true : src.periods.length > 0;

  out.refundLinks = src.refunds === undefined ? true : src.refunds.length > 0;
  out.categoryCaps =
    src.categories === undefined
      ? true
      : src.categories.some((c) => c.monthly_cap !== null && c.archived_at === null && !c.is_sample);
  // A goal that has a monthly amount is the one that gets contributions (the plan writes the repeating line).
  out.goalContributions = goals === undefined ? true : goals.some((g) => (g.monthly_amount ?? 0) > 0);
  out.debtPlan =
    debts === undefined
      ? true
      : debts.some((d) => (d.payoff_extra ?? 0) > 0 || d.payoff_order != null || d.extra_series_id != null);
  out.categoryDefaultSplits =
    src.splitDefaults === undefined ? true : src.splitDefaults.some((d) => d.category_ref !== null);
  out.sharedAccounts =
    live === undefined ? true : live.some((a) => a.is_shared === true && (a.tombstone_of ?? null) === null);
  out.settlements = src.settlements === undefined ? true : src.settlements.length > 0;

  const flags = src.flags;
  out.transfers = flags === undefined ? true : flags.transfers;
  out.importedLines = flags === undefined ? true : flags.importedLines;
  out.weightSplits = flags === undefined ? true : flags.weightSplits;
  out.amountSplits = flags === undefined ? true : flags.amountSplits;
  return out;
}

