/**
 * 05.3-38 (UI-SPEC "Assumptions line, links and actions"): the three links under the facts. "What could I do instead?" is an
 * outlined accent-border row (bands 3 and up, never needs_input); "The whole plan" shows for periodic checks; "See how this
 * was worked out" is an ink underlined text button. Text links are never accent.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { insteadLinkFor, type Band, type Result } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Text } from '@/ui/Text';
import { insteadHref, planHref, WORKED_HREF } from '@/features/decide/v3/nav/hrefs';
import { useV3Format } from '@/features/decide/v3/shared/useV3Format';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const ROW_RADIUS = 16;

export interface AnswerLinksProps {
  checkId: string;
  code: Result['code'];
  band: Band | null;
  /** The whole-plan total in minor units for a periodic check, otherwise null. */
  wholePlanTotal: number | null;
}

function Row({ label, borderColor, borderWidth, onPress }: { label: string; borderColor: string; borderWidth: number; onPress: () => void }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor, borderWidth, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={[styles.rowText, { ...textRole(pairing, 'label'), color: colors.ink }]}>{label}</Text>
      <View importantForAccessibility="no" accessibilityElementsHidden style={[styles.chevron, { borderColor: colors.inkSoft3 }]} />
    </Pressable>
  );
}

export function AnswerLinks({ checkId, code, band, wholePlanTotal }: AnswerLinksProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const showInstead = code !== 'needs_input' && band !== null && insteadLinkFor(band) !== 'none';
  return (
    <View style={styles.block}>
      {showInstead ? (
        <Row label={t('decide.v3.ui.answer.instead')} borderColor={colors.accent} borderWidth={1.5} onPress={() => pushOnce(insteadHref(checkId))} />
      ) : null}
      {wholePlanTotal === null ? null : (
        <Row
          label={t('decide.v3.ui.answer.wholePlan', { total: f.money(wholePlanTotal) })}
          borderColor={colors.line2}
          borderWidth={1}
          onPress={() => pushOnce(planHref(checkId))}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('decide.v3.ui.answer.worked')}
        onPress={() => pushOnce(WORKED_HREF)}
        style={({ pressed }) => [styles.text, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t('decide.v3.ui.answer.worked')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapMd },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    borderRadius: ROW_RADIUS,
    paddingVertical: space.gapSm,
    paddingHorizontal: space.cardPad,
  },
  rowText: { flex: 1 },
  chevron: { width: 8, height: 8, borderRightWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }] },
  text: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
