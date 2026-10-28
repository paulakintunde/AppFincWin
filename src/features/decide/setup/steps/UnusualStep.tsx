/**
 * Plan 05.2-25: "Any unusual months?". Up to six tiles for the last full months; a tap cycles
 * Normal -> Leave it out -> Half-logged -> Normal and announces the new status. Saved as month_marks holding only the
 * non-normal months (at most 12 keys, so the stored object stays far below the 4096-byte database check).
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { warnTint } from '@/theme/tokens';
import { hapticSelection } from '@/ui/haptics';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { everydayByMonth } from '@/engine/decide/v3';
import { Intro, useCopy, useNoWrapMoney, useReportReady } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

type Mark = 'normal' | 'out' | 'half';
const NEXT: Record<Mark, Mark> = { normal: 'out', out: 'half', half: 'normal' };
const STATUS_KEY: Record<Mark, string> = {
  normal: 'decide.setup.unusual.statusNormal',
  out: 'decide.setup.unusual.statusLeftOut',
  half: 'decide.setup.unusual.statusHalf',
};
const MAX_MARKS = 12;
const TILE_COUNT = 6;

function asMark(value: unknown): Mark {
  return value === 'out' || value === 'half' ? value : 'normal';
}

/** 3 columns from 360 dp up to 1.3x text, 2 up to 1.7x, 1 beyond; narrower than 360 dp gets 2 (1 beyond 1.7x). */
export function tileColumns(width: number, fontScale: number): 1 | 2 | 3 {
  if (fontScale > 1.7) return 1;
  if (width < 360 || fontScale > 1.3) return 2;
  return 3;
}

function Legend({ textKey }: { textKey: string }) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const full = t(textKey);
  const at = full.indexOf(':');
  const style = { ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim };
  return (
    <Text style={style}>
      <Text style={{ ...style, color: colors.ink, fontWeight: '700' }}>{full.slice(0, at + 1)}</Text>
      {full.slice(at + 1)}
    </Text>
  );
}

export const UnusualStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function UnusualStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const settings = useDecideSettings(userId).data;
  const v3 = useDecideV3();
  const saver = useSaveSetupStep(userId ?? '');
  const currency = v3.inputs?.currency ?? rc.homeCurrency;
  const noWrap = useNoWrapMoney(currency);
  const { locale } = useMoneyFormatter(false, currency);
  const { width } = useWindowDimensions();
  const fontScale = useFontScale();
  const readOnly = useReadOnlyScope();

  const months = v3.inputs?.months;
  const series = v3.inputs?.series;
  const tiles = useMemo(() => {
    if (months === undefined || series === undefined) return [];
    const spend = new Map(everydayByMonth(months, series).map((e) => [e.month, Number(e.everyday)]));
    return months
      .filter((m) => m.full && m.month < rc.today.slice(0, 7))
      .map((m) => m.month)
      .sort()
      .slice(-TILE_COUNT)
      .map((month) => ({ month, spent: spend.get(month) ?? 0 }));
  }, [months, series, rc.today]);

  const stored = useMemo((): Record<string, Mark> => {
    const out: Record<string, Mark> = {};
    for (const [k, v] of Object.entries(settings?.month_marks ?? {})) if (v === 'out' || v === 'half') out[k] = v;
    return out;
  }, [settings?.month_marks]);
  const [draft, setDraft] = useState<Record<string, Mark>>({});
  const markOf = (month: string): Mark => draft[month] ?? asMark(stored[month]);

  // The stored marks with this screen's months applied; other months are kept, the newest 12 survive.
  const merged = useMemo(() => {
    const next: Record<string, Mark> = { ...stored };
    for (const [month, mark] of Object.entries(draft)) {
      if (mark === 'normal') delete next[month];
      else next[month] = mark;
    }
    const keys = Object.keys(next).sort().slice(-MAX_MARKS);
    const trimmed: Record<string, Mark> = {};
    for (const k of keys) trimmed[k] = next[k] as Mark;
    return trimmed;
  }, [stored, draft]);
  const dirty = JSON.stringify(merged) !== JSON.stringify(Object.fromEntries(Object.entries(stored).sort(([a], [b]) => (a < b ? -1 : 1))));

  useReportReady(onReadyChange, true, null, dirty);

  useImperativeHandle(ref, () => ({
    save() {
      if (userId === undefined || !dirty) return { stepId: null };
      const result = saver.save({
        stepTitle: t('decide.setup.unusual.title'),
        patch: { month_marks: Object.keys(merged).length === 0 ? null : merged },
      });
      return { stepId: result?.stepId ?? null };
    },
  }));

  const monthName = (month: string): string => {
    const [y, m] = month.split('-') as [string, string];
    return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(Number(y), Number(m) - 1, 1));
  };

  const columns = tileColumns(width, fontScale);
  const gap = space.gapMd;
  const tileWidth = Math.floor((width - space.screenH * 2 - gap * (columns - 1)) / columns);

  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="decide.setup.unusual.intro" />
      <View testID="unusual-grid" style={[styles.grid, { gap }]}>
        {tiles.map(({ month, spent }) => {
          const mark = markOf(month);
          const flagged = mark !== 'normal';
          const status = t(STATUS_KEY[mark]);
          const name = monthName(month);
          return (
            <Pressable
              key={month}
              testID={`unusual-tile-${month}`}
              accessibilityRole="button"
              accessibilityLabel={t('decide.setup.unusual.tileA11y', { month: name, amount: noWrap(spent), status })}
              accessibilityState={{ disabled: readOnly }}
              disabled={readOnly}
              onPress={() => {
                hapticSelection();
                const nextMark = NEXT[mark];
                setDraft({ ...draft, [month]: nextMark });
                void AccessibilityInfo.announceForAccessibility(t('decide.setup.unusual.announce', { month: name, status: t(STATUS_KEY[nextMark]) }));
              }}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tileWidth,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                  backgroundColor: flagged ? colors.fill3 : colors.surface,
                  borderColor: flagged ? colors.warn1 : colors.line2,
                  borderWidth: flagged ? 1.5 : 1,
                  borderStyle: flagged ? 'dashed' : 'solid',
                },
              ]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{name}</Text>
              <Text numberOfLines={1} style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{noWrap(spent)}</Text>
              <View style={[styles.chip, { backgroundColor: flagged ? warnTint : colors.accentTint1 }]}>
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: flagged ? colors.warn1 : colors.ink }}>{status}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: space.gapSm }}>
        <Legend textKey="decide.setup.unusual.legendNormal" />
        <Legend textKey="decide.setup.unusual.legendLeftOut" />
        <Legend textKey="decide.setup.unusual.legendHalf" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm / 2, minHeight: space.touchMin },
  chip: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: space.gapSm, paddingVertical: 4 },
});
