/**
 * 05-145 (D-107, DCU-40): "The outcome on each basis". The same check under This month, Worst month and Average month side by
 * side, each with the verdict state chip and the month figure in the free / overspent words; the basis in use is marked.
 * Reads computation.basisOutcomes (idle time). While the inputs are typed (busy) the card keeps its last values for the same
 * check, silently, with aria busy. Not busy and null: nothing, and the held value is cleared. A new check (checkKey) drops it.
 * Rows stack one per line under rule S. Declarative voice only; every string is a catalogue key.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { isOverspent, monthFigure } from '../copy/monthFigure';
import type { Fmt } from '../copy/types';
import { stateChip } from '../copy/verdictCopy';
import type { BasisOutcome, BasisOutcomes } from '../snapshot/types';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { useShouldStack } from '../ui/textFit';
import { refText, type Translate } from './refText';

export interface BasisOutcomeCardProps {
  outcomes: BasisOutcomes | null;
  /** The flow's revealKey: a held value never outlives the check it was computed for. */
  checkKey: string;
  fmt: Fmt;
  /** D-94: the spoken form of the same amounts. */
  fmtA11y?: Fmt;
  busy?: boolean;
}

interface Held { key: string; value: BasisOutcomes }

export function BasisOutcomeCard({ outcomes, checkKey, fmt, fmtA11y = fmt, busy = false }: BasisOutcomeCardProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  // the held value is state adjusted during render (settles in one extra pass), so it follows the props without an effect
  const [held, setHeld] = useState<Held | null>(null);
  let current = held !== null && held.key === checkKey ? held : null;
  if (outcomes !== null) {
    if (current === null || current.value !== outcomes) current = { key: checkKey, value: outcomes };
  } else if (!busy) {
    current = null;
  }
  if (current !== held) setHeld(current);
  const shown = outcomes ?? (busy ? current?.value ?? null : null);
  if (shown === null) return null;

  const row = (r: BasisOutcome): React.JSX.Element => {
    const chip = stateChip(r.state, 'full');
    const stateWord = t(chip.key);
    const basisName = t(`decide.verdict.compare.${r.basis}`);
    const figure = refText(t, monthFigure(r.left, fmt));
    const spoken = refText(t, monthFigure(r.left, fmtA11y));
    const waiting = r.waitingCurrencies !== null ? t('decide.verdict.compare.waiting', { currency: r.waitingCurrencies.join(', ') }) : '';
    const label = t(r.chosen ? 'decide.verdict.compare.rowA11yChosen' : 'decide.verdict.compare.rowA11y', { basis: basisName, state: stateWord, figure: spoken });
    return (
      <View
        key={r.basis}
        accessible
        accessibilityLabel={waiting ? `${label} ${waiting}` : label}
        accessibilityState={r.chosen ? { selected: true } : undefined}
        testID={`basis-outcome-${r.basis}`}
        style={[styles.row, stacked ? styles.rowStacked : styles.rowColumn, r.chosen ? { backgroundColor: colors.fill1 } : null]}
      >
        <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {basisName}
        </Text>
        <StateChip tone={chip.tone as StateChipTone} label={stateWord} />
        <Text style={{ ...textRole(pairing, 'body'), fontWeight: '600', color: isOverspent(r.left) ? colors.danger : colors.ink }}>{figure}</Text>
        {r.chosen ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.verdict.compare.chosen')}</Text>
        ) : null}
        {waiting ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{waiting}</Text> : null}
      </View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="basis-outcome-card">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('decide.verdict.compare.title')}
      </Text>
      <View accessibilityState={{ busy }} testID="basis-outcome-rows" style={stacked ? styles.rowsStacked : styles.rowsSide}>
        {shown.rows.map(row)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  rowsSide: { flexDirection: 'row', gap: space.gapSm },
  rowsStacked: { flexDirection: 'column', gap: space.gapSm },
  row: { borderRadius: radii.glyphTile, padding: space.gapMd, gap: space.gapSm },
  rowColumn: { flex: 1 },
  rowStacked: { alignSelf: 'stretch' },
});
