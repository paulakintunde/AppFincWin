/**
 * 08.1-09 (D-09..D-11, UI-SPEC section 5): the tick rows on the Bought screen. Every part Record as bought could write besides the
 * purchase is its own row, grouped under a heading, one row per item, never merged. Every row starts unticked except "Close the
 * goal" (D-11); an unticked part is not sent, so the app applies nothing on its own (T-08.1-22).
 *
 * boughtRowsOf is pure (no React): it turns the check and what the screen read (stopping bills, the old loan, the goal) into groups.
 * BoughtSaveRows draws them. Each row's spoken label is its title, its sub-line and its state.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { RunningCostLine } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';

type Translate = ReturnType<typeof useT>;

/** A cost line with the name the user sees for it (a prefilled line has a fixed label; an added one carries its own name). */
export interface BoughtCostLine {
  readonly line: RunningCostLine;
  readonly name: string;
}

/** A bill the purchase stops, already checked against the recorded bills (only bills that will really end are offered). */
export interface BoughtStopRow {
  readonly id: string;
  readonly name: string;
  /** 'YYYY-MM-DD': the day the cost stops from. */
  readonly date: string;
}

export interface BoughtRowsInput {
  readonly costs: readonly BoughtCostLine[];
  readonly stops: readonly BoughtStopRow[];
  /** What the old one sells for (minor units), or null. */
  readonly sale: { readonly amount: number } | null;
  /** The old loan the sale pays: its name and what goes to it (minor units), or null. */
  readonly payoff: { readonly name: string; readonly amount: number } | null;
  /** The goal this check made and has not closed, or null. */
  readonly goal: { readonly id: string; readonly name: string } | null;
  readonly formatMoney: (minor: number) => string;
  readonly formatDate: (date: string) => string;
}

export interface BoughtRow {
  /** 'cost:<line id>', 'sale', 'payoff', 'stop:<stopped cost id>' or 'goal'. */
  readonly key: string;
  readonly title: string;
  readonly sub?: string;
  /** Starts ticked (only the goal close does, D-11). */
  readonly startsTicked: boolean;
}

export interface BoughtGroup {
  readonly key: 'costs' | 'money' | 'stops' | 'goal';
  readonly heading: string;
  readonly rows: readonly BoughtRow[];
}

/** What a line takes in a usual month, rounded half up (a yearly or every-3-month cost shows as its monthly part). */
function monthlyOf(line: RunningCostLine): number {
  return Math.round(line.amount / line.everyMonths);
}

/** The groups in order, a group with no rows left out (no empty card). */
export function boughtRowsOf(t: Translate, input: BoughtRowsInput): BoughtGroup[] {
  const a = 'decide.screens.answerActions.bought';
  const groups: BoughtGroup[] = [];

  const costs: BoughtRow[] = input.costs.map(({ line, name }) =>
    line.varies === true
      ? { key: `cost:${line.id}`, title: t(`${a}.rowVaries`, { name, amount: input.formatMoney(monthlyOf(line)) }), sub: t(`${a}.subVaries`), startsTicked: false }
      : { key: `cost:${line.id}`, title: t(`${a}.rowFixed`, { name, amount: input.formatMoney(monthlyOf(line)) }), startsTicked: false }
  );
  if (costs.length > 0) groups.push({ key: 'costs', heading: t(`${a}.groupCosts`), rows: costs });

  const money: BoughtRow[] = [];
  if (input.sale !== null) {
    const item = input.payoff?.name ?? t(`${a}.oldOne`);
    money.push({ key: 'sale', title: t(`${a}.rowSale`, { item, amount: input.formatMoney(input.sale.amount) }), startsTicked: false });
  }
  if (input.payoff !== null) {
    money.push({ key: 'payoff', title: t(`${a}.rowPayoff`, { debt: input.payoff.name, amount: input.formatMoney(input.payoff.amount) }), startsTicked: false });
  }
  if (money.length > 0) groups.push({ key: 'money', heading: t(`${a}.groupMoney`), rows: money });

  const stops: BoughtRow[] = input.stops.map((s) => ({
    key: `stop:${s.id}`,
    title: t(`${a}.rowStop`, { bill: s.name, date: input.formatDate(s.date) }),
    startsTicked: false,
  }));
  if (stops.length > 0) groups.push({ key: 'stops', heading: t(`${a}.groupStops`), rows: stops });

  if (input.goal !== null) {
    groups.push({
      key: 'goal',
      heading: t(`${a}.groupGoal`),
      rows: [{ key: 'goal', title: t(`${a}.rowGoal`, { goal: input.goal.name }), sub: t(`${a}.subGoal`), startsTicked: true }],
    });
  }
  return groups;
}

/** The ticks every row starts with (D-09, D-10, D-11). */
export function initialTicks(groups: readonly BoughtGroup[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const g of groups) for (const r of g.rows) out[r.key] = r.startsTicked;
  return out;
}

export interface BoughtSaveRowsProps {
  groups: readonly BoughtGroup[];
  ticks: Readonly<Record<string, boolean>>;
  onToggle: (key: string, next: boolean) => void;
}

export function BoughtSaveRows({ groups, ticks, onToggle }: BoughtSaveRowsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (groups.length === 0) return null;
  return (
    <View testID="bought-save-rows" style={styles.groups}>
      {groups.map((g) => (
        <View key={g.key} testID={`bought-group-${g.key}`} style={styles.group}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {g.heading}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {g.rows.map((r) => {
              const on = ticks[r.key] === true;
              const state = t(on ? 'decide.screens.answerActions.bought.stateOn' : 'decide.screens.answerActions.bought.stateOff');
              return (
                <ToggleRow
                  key={r.key}
                  label={r.title}
                  sub={r.sub}
                  value={on}
                  onChange={(next) => onToggle(r.key, next)}
                  accessibilityLabel={r.sub === undefined ? `${r.title}, ${state}` : `${r.title}, ${r.sub}, ${state}`}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: space.groupGap },
  group: { gap: space.gapSm },
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm },
});
