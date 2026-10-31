/**
 * 05.3-25 (UI-SPEC Hero): "How sure this answer is". One sentence per reason key from confidenceChip(), the header Close control. Built on the shared Sheet (modal, so focus stays inside and returns to the chip on close).
 * 05.3-59 (D-24, D-27, D-31): after the reasons, the user's answers the result rests on, each once, with its effect line
 * and its own "Ask again" button. The confidence level never changes here. Ask again closes the sheet first (UAT step 0.24).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Confidence } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { confidenceChip } from '../model/confidence';
import { WAIVER_UNNAMED_KEY, type WaiverRow, type WaiverRowParams } from '../model/waiverNote';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The two formatters a waiver row needs (useV3Format provides both). */
export interface WaiverFormat {
  date(iso: string): string;
  month(ym: string): string;
}

/** A waiver text with its name, date and month formatted; a missing name reads as the unnamed fallback. */
export function waiverText(t: Translate, f: WaiverFormat, key: string, params: WaiverRowParams): string {
  return t(key, {
    name: params.name ?? t(WAIVER_UNNAMED_KEY),
    date: params.date === undefined ? undefined : f.date(params.date),
    month: params.month === undefined ? undefined : f.month(params.month),
  });
}

const W = 'decide.v3.ui.confidence.waiver.';

export interface ConfidenceSheetV3Props {
  visible: boolean;
  confidence: Confidence;
  onClose: () => void;
  /** 05.3-59: the answers the result rests on; absent or empty shows the sheet exactly as before */
  waivers?: readonly WaiverRow[];
  format?: WaiverFormat;
  onAskAgain?: (row: WaiverRow) => void;
}

const ROW_MIN = 44;
const IDENTITY: WaiverFormat = { date: (s) => s, month: (s) => s };

export function ConfidenceSheetV3({ visible, confidence, onClose, waivers, format, onAskAgain }: ConfidenceSheetV3Props): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const { reasonKeys } = confidenceChip(confidence);
  const title = t('decide.v3.ui.confidence.sheetTitle');
  const close = t('decide.v3.ui.confidence.close');
  const rows = waivers ?? [];
  const f = format ?? IDENTITY;
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={close} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.rows}>
          {reasonKeys.map((key) => (
            <View key={key} style={styles.row} accessible accessibilityLabel={t(key)}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(key)}</Text>
            </View>
          ))}
          {rows.length === 0 ? null : (
            <View style={[styles.waivers, { borderTopColor: colors.line1 }]}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t(`${W}heading`)}</Text>
              {rows.map((row) => {
                const text = waiverText(t, f, row.textKey, row.params);
                const effect = row.effectKey === null ? null : t(row.effectKey);
                return (
                  <View key={row.key} style={styles.waiver}>
                    <View style={styles.waiverText} accessible accessibilityLabel={effect === null ? text : `${text}. ${effect}`}>
                      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{text}</Text>
                      {effect === null ? null : (
                        <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{effect}</Text>
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(`${W}askAgainA11y`, { text })}
                      onPress={() => {
                        onClose();
                        onAskAgain?.(row);
                      }}
                      style={styles.askAgain}
                    >
                      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t(`${W}askAgain`)}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.gapSm },
  row: { minHeight: ROW_MIN, justifyContent: 'center' },
  waivers: { gap: space.gapSm, borderTopWidth: 1, paddingTop: space.gapMd },
  waiver: { gap: space.gapSm },
  waiverText: { gap: space.gapSm },
  askAgain: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: space.touchMin, justifyContent: 'center' },
});
