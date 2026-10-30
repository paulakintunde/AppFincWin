// 05.3-34 (DSV-14, UI-SPEC Home, Refine card): accentTint1 card, radius 26. Review opens the review screen; Later hides the
// card for 14 days through the stored snooze date (the one refine() reads), with an Undo toast. Renders nothing unless
// refineHomeCard says to show.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStampRefine } from '@/data/mutations/decideSetup';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useShouldStack } from '../../ui/textFit';
import { refineHomeCard } from '../model/refineModel';
import { REFINE_HREF } from '../nav/hrefs';
import { snoozeUntil } from './refineIntents';
import { useRefine } from './useRefine';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function RefineCard(): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const stacked = useShouldStack();
  const { result, snoozed } = useRefine();
  const stamp = useStampRefine(rc.userId ?? '');
  const card = refineHomeCard(result, snoozed);
  if (!card.show) return null;

  const later = (): void => {
    const r = stamp.snooze(snoozeUntil(rc.today));
    if (r !== null) showToast({ kind: 'ordinary', text: undoLabelText('refineSnoozed', {}), stepId: r.stepId });
  };
  const K = 'decide.v3.ui.refine.';
  return (
    <View style={[styles.card, { backgroundColor: colors.accentTint1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.accent }}>{t(card.eyebrowKey)}</Text>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t(`${K}heading`)}
      </Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t(card.bodyKey, { count: card.count })}</Text>
      <View style={stacked ? styles.actionsStacked : styles.actions}>
        <View style={stacked ? undefined : styles.review}>
          <Pill variant="secondary" label={t(`${K}review`)} onPress={() => pushOnce(REFINE_HREF)} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`${K}later`)}
          onPress={later}
          style={({ pressed }) => [styles.later, stacked ? styles.laterStacked : styles.laterRow, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t(`${K}later`)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 20, gap: space.gapMd },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  actionsStacked: { gap: space.gapSm },
  review: { flex: 2 },
  later: { minHeight: space.touchMin, justifyContent: 'center', alignItems: 'center' },
  laterRow: { flex: 1 },
  laterStacked: { alignSelf: 'stretch' },
});
