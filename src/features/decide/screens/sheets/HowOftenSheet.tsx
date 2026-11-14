/**
 * 06.1-15 (D43): How often a cost comes: every month, 3 months or year, when it starts and an optional end. Nothing applies until
 * "Save how often". 06.1-53 (C-15): an end date before the start date keeps Save off and says why. The date choices open the caller's own date picker through onPickDate, so this sheet stays one screen deep.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LocalDate } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { NeedLine } from '../ui/NeedLine';

export type EveryMonths = 1 | 3 | 12;

export interface HowOftenValue {
  everyMonths: EveryMonths;
  /** null = the day it is bought. */
  start: LocalDate | null;
  /** null = no end. */
  end: LocalDate | null;
}

export interface HowOftenSheetProps {
  visible: boolean;
  value: HowOftenValue;
  /** The cost's amount in minor units, for the "about N a month" line; null hides the line. */
  amount: number | null;
  formatMoney: (minor: number) => string;
  formatDate: (date: LocalDate) => string;
  /** Opens the caller's date picker; it answers through the returned setter. */
  onPickDate: (which: 'start' | 'end', current: LocalDate | null, set: (date: LocalDate | null) => void) => void;
  onSave: (value: HowOftenValue) => void;
  onDismiss: () => void;
}

const CHOICES: readonly { every: EveryMonths; key: 'everyMonth' | 'every3Months' | 'everyYear' }[] = [
  { every: 1, key: 'everyMonth' },
  { every: 3, key: 'every3Months' },
  { every: 12, key: 'everyYear' },
];

export function HowOftenSheet(props: HowOftenSheetProps) {
  return props.visible ? <HowOftenForm {...props} /> : null;
}

function HowOftenForm({ value, amount, formatMoney, formatDate, onPickDate, onSave, onDismiss }: HowOftenSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [start0] = useState(value);
  const [draft, setDraft] = useState<HowOftenValue>(value);
  const dirty = useIsDirty(start0, draft);
  const title = t('decide.screens.common.howOften');
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  const live =
    amount !== null && amount > 0 && draft.everyMonths !== 1
      ? t(draft.everyMonths === 12 ? 'decide.screens.sheetsInput.often.lineYear' : 'decide.screens.sheetsInput.often.lineQuarter', {
          amount: formatMoney(amount),
          monthly: formatMoney(Math.round(amount / draft.everyMonths)),
        })
      : '';
  // 06.1-53 (C-15): an end before the start is refused. LocalDate strings compare as plain text; the same day is allowed.
  const endBeforeStart = draft.start !== null && draft.end !== null && draft.end < draft.start;

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.column}>
          {CHOICES.map((c) => {
            const label = t(`decide.screens.sheetsInput.often.${c.key}`);
            const selected = draft.everyMonths === c.every;
            return (
              <Pressable
                key={c.every}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => setDraft((d) => ({ ...d, everyMonths: c.every }))}
                style={styles.radio}
              >
                <RadioDot selected={selected} />
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={small}>{t('decide.screens.sheetsInput.often.starts')}</Text>
        <View style={styles.chips}>
          <Chip label={t('decide.screens.sheetsInput.often.whenIBuy')} selected={draft.start === null} onPress={() => setDraft((d) => ({ ...d, start: null }))} />
          <Chip
            label={draft.start === null ? t('decide.screens.common.pickDate') : formatDate(draft.start)}
            selected={draft.start !== null}
            onPress={() => onPickDate('start', draft.start, (start) => setDraft((d) => ({ ...d, start })))}
          />
        </View>

        <Text style={small}>{t('decide.screens.sheetsInput.often.ends')}</Text>
        <View style={styles.chips}>
          <Chip label={t('decide.screens.sheetsInput.often.noEnd')} selected={draft.end === null} onPress={() => setDraft((d) => ({ ...d, end: null }))} />
          <Chip
            label={draft.end === null ? t('decide.screens.common.pickDate') : formatDate(draft.end)}
            selected={draft.end !== null}
            onPress={() => onPickDate('end', draft.end, (end) => setDraft((d) => ({ ...d, end })))}
          />
        </View>

        <Text style={small}>{t('decide.screens.sheetsInput.often.weeklyHelp')}</Text>
        <View accessibilityLiveRegion="polite">{live === '' ? null : <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{live}</Text>}</View>

        <Pill label={t('decide.screens.sheetsInput.often.save')} variant="primary" disabled={endBeforeStart} onPress={() => onSave(draft)} />
        <NeedLine text={endBeforeStart ? t('decide.screens.sheetsInput.often.need.endBeforeStart') : null} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
