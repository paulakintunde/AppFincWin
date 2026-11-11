// 06.1-20 (D60): "Buy later". Each date is judged again with that purchase date, so each row shows its own answer word (with the
// state glyph, never colour alone) and what is left. Dates: the engine's ready date (readyDate) and the next paydays. Choosing one
// hands the date back and the answer updates in place. Spare money only; the safety net stays locked.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Evaluation, Futures, LocalDate } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Text } from '@/ui/Text';
import { DetailShell, useDetailFormat, useVerdictOf } from './detailKit';

/** The most dates offered. */
export const MAX_LATER_DATES = 4;

/** The dates to compare: the ready date, then the next paydays, on or after today, each once, in date order. */
export function laterDates(today: string, futures: Futures | null, readyOn: LocalDate | null, paydays: readonly LocalDate[]): LocalDate[] {
  const picked = new Set<string>();
  const add = (d: string | null): void => {
    if (d !== null && d >= today) picked.add(d);
  };
  add(readyOn);
  for (const p of paydays) add(p);
  const by = futures?.buyLater.readyBy ?? null;
  if (picked.size === 0 && by !== null) add(by.length === 7 ? `${by}-01` : by);
  return [...picked].sort().slice(0, MAX_LATER_DATES) as LocalDate[];
}

export interface BuyLaterSheetProps {
  currency: string;
  today: string;
  futures: Futures | null;
  readyOn: LocalDate | null;
  paydays: readonly LocalDate[];
  /** Judges the same check with this purchase date (judgeCheck on the held Prepared). */
  judgeOn: (date: LocalDate) => Evaluation | null;
  chosen?: LocalDate | null;
  onUseDate: (date: LocalDate) => void;
  onCantSee?: () => void;
  onClose: () => void;
}

export function BuyLaterSheet({ currency, today, futures, readyOn, paydays, judgeOn, chosen = null, onUseDate, onCantSee, onClose }: BuyLaterSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const verdictOf = useVerdictOf();
  const k = (key: string, values?: Record<string, string>): string => String(t(`decide.screens.answerDetail.later.${key}` as never, values as never));
  const dates = laterDates(today, futures, readyOn, paydays);
  const [pick, setPick] = useState<LocalDate | null>(chosen);
  return (
    <DetailShell title={k('title')} sub={k('sub')} footer={t('legal.decideAnswer.footer')} caveatLine onCantSee={onCantSee} onClose={onClose}>
      {dates.length === 0 ? (
        <Text testID="later-none" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {k('noDates')}
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel={k('pick')} style={styles.list}>
          {dates.map((d) => {
            const ev = judgeOn(d);
            const v = ev === null ? null : verdictOf(ev);
            const selected = pick === d;
            const left = v === null ? null : k('leaves', { amount: f.money(v.left) });
            return (
              <Pressable
                key={d}
                testID={`later-option-${d}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={k('optionA11y', { date: f.date(d), word: v?.word ?? '', left: v === null ? '' : k('leaves', { amount: f.spoken(v.left) }) })}
                onPress={() => setPick(d)}
                style={[styles.row, { backgroundColor: selected ? colors.fill1 : colors.fill6 }]}
              >
                <RadioDot selected={selected} />
                <View style={styles.text}>
                  <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{f.date(d)}</Text>
                  {v !== null ? (
                    <View style={styles.word}>
                      <StateGlyph name={v.glyph} color={stateColors[v.tone].color} size={16} />
                      <Text testID={`later-word-${d}`} style={{ ...textRole(pairing, 'label'), color: stateColors[v.tone].color }}>
                        {v.word}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {left !== null ? (
                  <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: colors.inkDim, fontVariant: ['tabular-nums'] }}>
                    {left}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
      <Pill label={k('use')} variant="secondary" disabled={pick === null} onPress={() => (pick === null ? undefined : onUseDate(pick))} />
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin, padding: space.cardPad, borderRadius: space.cardPad },
  text: { flex: 1, flexShrink: 1, gap: 2 },
  word: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
