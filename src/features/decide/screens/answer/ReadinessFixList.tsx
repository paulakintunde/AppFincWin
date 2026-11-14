// 06.1-44 (G-1, audit C-2, D-54): the named readiness items, one row each. Each row says what is missing in one sentence (a single
// accessibility stop), then its one fix, then the answers the engine accepts for it as secondary pills. An envelope row offers only
// "Which account?" and never an answer (D-54). Presentational: rows and formatters in, taps out, so Records setup (plan 45) can reuse it.
// 06.1-68 (H-7, CB-11, CF-2): a row the person just answered reads "Saved, updating…" at once with its choices off (no second
// answer while the first saves), until the engine's list drops it. DS-1: a goal row says it is a Grow goal, with the reason behind Why?.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LocalDate, ReadinessItem, YearMonth } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';
import type { ReadinessFixRow, WaiverChoice } from '../logic/readinessFixes';

export interface ReadinessFixListProps {
  rows: readonly ReadinessFixRow[];
  /** The day the answer is judged on; a spending item of this month reads "Nothing spent is recorded since {{date}}." */
  asOf: LocalDate;
  /** Formats integer minor units in the home currency. */
  money: (minor: number) => string;
  date: (d: LocalDate) => string;
  monthName: (ym: YearMonth) => string;
  onFix: (row: ReadinessFixRow) => void;
  onChoice: (row: ReadinessFixRow, choice: WaiverChoice) => void;
  /** 06.1-66 (OQ-66-1): the answer's Not ready card names its first open row "First: …" (more may follow). Absent = plain sentences. */
  leadFirst?: boolean;
  /** 06.1-68 (CB-11): ids of rows answered here and not yet dropped by the engine. They read "Saved, updating…" with choices off. */
  answered?: ReadonlySet<string>;
}

type T = (key: string, params?: Record<string, string | number>) => string;
const K = 'decide.screens.answer.notReady';
const R = 'decide.screens.answer.readiness';
const NO_ANSWERED: ReadonlySet<string> = new Set();

/** DS-1: why a goal with no account stops the answer, one tap away (short line first). */
function GoalWhy({ index }: { index: number }) {
  const t = useT() as unknown as T;
  const { colors, pairing } = useTheme();
  const press = usePressFeedback('row');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID={`readiness-why-${index}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        hitSlop={LINK_HIT_SLOP}
        android_ripple={press.android_ripple}
        style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{open ? t(`${R}.whyLess`) : t(`${R}.why`)}</Text>
      </Pressable>
      {open ? (
        <Text testID={`readiness-why-text-${index}`} style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
          {t(`${R}.goalWhy`)}
        </Text>
      ) : null}
    </>
  );
}

/** The one sentence that names the item. */
export function itemSentence(item: ReadinessItem, asOf: LocalDate, f: Pick<ReadinessFixListProps, 'money' | 'date' | 'monthName'>, t: T): string {
  const amount = f.money(Math.abs(item.amount ?? 0));
  const date = item.date === null ? '' : f.date(item.date);
  switch (item.kind) {
    case 'pay':
      return item.name === null ? t(`${K}.item.payNoName`, { amount, date }) : t(`${K}.item.pay`, { name: item.name, amount, date });
    case 'bill':
      return item.name === null ? t(`${K}.item.billNoName`, { amount, date }) : t(`${K}.item.bill`, { name: item.name, amount, date });
    case 'spending':
      return item.month === asOf.slice(0, 7) && item.date !== null
        ? t(`${K}.item.spendingNow`, { date })
        : t(`${K}.item.spending`, { monthName: f.monthName(item.month) });
    case 'late_start':
      return t(`${K}.item.lateStart`, { monthName: f.monthName(item.month) });
    case 'envelopes':
      // DS-1: every Decide envelope is a Grow goal; the row says so.
      return item.name === null ? t(`${R}.goalNoAccountNoName`) : t(`${R}.goalNoAccount`, { envelope: item.name });
  }
}

function choiceLabel(row: ReadinessFixRow, c: WaiverChoice, monthName: (ym: YearMonth) => string, t: T): string {
  if (c.key === 'nothingToAdd') return t(`${K}.choice.nothingToAdd`, { monthName: monthName(row.item.month) });
  if (c.key === 'startFrom') {
    const month = c.waiver?.kind === 'start_from' ? c.waiver.month : row.item.month;
    return t(`${K}.choice.startFrom`, { monthName: monthName(month) });
  }
  return t(`${K}.choice.${c.key}`);
}

export function ReadinessFixList({ rows, asOf, money, date, monthName, onFix, onChoice, leadFirst = false, answered = NO_ANSWERED }: ReadinessFixListProps) {
  const t = useT() as unknown as T;
  const { colors, pairing } = useTheme();
  // 06.1-62 (CB-5 / CB-6): links show a press at once and reach 52 dp tall.
  const press = usePressFeedback('row');
  // 06.1-66 / 06.1-68: "First:" names the first row still open; an answered row above it is not the first thing to do.
  const firstOpen = rows.findIndex((r) => !answered.has(r.id));
  return (
    <View testID="readiness-list" style={styles.list}>
      {rows.map((row, i) => {
        const fixLabel = row.fix.kind === 'linkEnvelope' ? t(`${K}.fix.envelope`) : t(`${K}.fix.records`, { monthName: monthName(row.fix.month) });
        const sentence = itemSentence(row.item, asOf, { money, date, monthName }, t);
        const done = answered.has(row.id);
        return (
          <View key={row.id} testID={`readiness-row-${i}`} style={styles.row}>
            <Text accessible style={{ ...textRole(pairing, 'body'), color: done ? colors.inkDim : colors.ink }}>
              {leadFirst && i === firstOpen ? t(`${K}.first`, { item: sentence }) : sentence}
            </Text>
            {done ? (
              <Text testID={`readiness-saved-${i}`} accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
                {t(`${R}.savedUpdating`)}
              </Text>
            ) : (
              <>
                {row.item.kind === 'envelopes' ? <GoalWhy index={i} /> : null}
                <Pressable testID={`readiness-fix-${i}`} accessibilityRole="link" accessibilityLabel={fixLabel} onPress={() => onFix(row)} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{fixLabel}</Text>
                </Pressable>
              </>
            )}
            {row.choices.length > 0 ? (
              <View style={styles.choices}>
                {row.choices.map((c) => (
                  <Pill key={c.key} variant="secondary" label={choiceLabel(row, c, monthName, t)} disabled={done} onPress={() => onChoice(row, c)} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.groupGap, alignSelf: 'stretch' },
  row: { gap: space.gapSm, alignItems: 'flex-start' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
