// 05.3-34 (DSV-14, UI-SPEC Refine review): one change the records show. Dashed inkSoft1 border while To check, solid line2
// once decided. Two radio-style buttons; the text part is one accessibility group ("{kicker}. {title}. {body}. {status}.")
// and a status change is announced politely. Radius 26, padding 16/18, gap 8.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { hapticSelection } from '@/ui/haptics';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { warnTint } from '@/theme/tokens';
import { Text } from '@/ui/Text';
import { useShouldStack } from '../../ui/textFit';
import type { RefineCardModel } from '../model/refineModel';
import { useV3Format } from '../shared/useV3Format';
import type { RefineDecision, RefineIntent } from './refineIntents';
import { INTENTS } from './refineIntents';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface RefineItemCardProps {
  model: RefineCardModel;
  decision: RefineDecision | null;
  onChoose(intent: RefineIntent): void;
}

export function RefineItemCard({ model, decision, onChoose }: RefineItemCardProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const K = 'decide.v3.ui.refine.';

  const money = (v: number | null): string => (v === null ? '' : f.money(v));
  const params = { current: money(model.params.current), suggested: money(model.params.suggested), month: model.params.month === null ? '' : f.monthYear(model.params.month) };
  const status = t(`${K}status.${decision === 'updated' ? 'updated' : decision === 'kept' ? 'kept' : 'toCheck'}`);
  const kicker = t(model.kickerKey);
  const title = t(model.titleKey, params);
  const body = t(model.bodyKey, params);
  const chip =
    decision === 'updated'
      ? { bg: colors.accentTint1, fg: colors.accent }
      : decision === 'kept'
        ? { bg: colors.fill1, fg: colors.inkDim }
        : { bg: warnTint, fg: colors.warn1 };
  const border = decision === null ? { borderColor: colors.inkSoft1, borderStyle: 'dashed' as const } : { borderColor: colors.line2, borderStyle: 'solid' as const };
  const intents = INTENTS[model.kind];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, border]}>
      <View accessible accessibilityLabel={t(`${K}cardA11y`, { kicker, title, body, status })} style={styles.text}>
        <View style={styles.kickerRow}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, flexShrink: 1 }}>{kicker}</Text>
          <View accessibilityLiveRegion="polite" style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: chip.fg }}>{status}</Text>
          </View>
        </View>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{title}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{body}</Text>
      </View>
      <View accessibilityRole="radiogroup" style={stacked ? styles.buttonsStacked : styles.buttonsRow}>
        {model.choices.map((c, i) => {
          const intent = intents[i] as RefineIntent;
          const picked = decision === (intent === 'update' ? 'updated' : 'kept');
          // A card with no suggested figure (a code-only card) shows the current one on its figure buttons.
          const amount = c.amount === 'suggested' ? (model.params.suggested ?? model.params.current) : model.params.current;
          const label = t(c.key, { amount: money(amount) });
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: picked }}
              onPress={() => {
                hapticSelection();
                onChoose(intent);
              }}
              style={({ pressed }) => [
                styles.radio,
                stacked ? styles.radioStacked : styles.radioRow,
                { backgroundColor: picked ? colors.accentTint1 : colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 },
              ]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: picked ? colors.accent : colors.ink, textAlign: 'center' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1.5, paddingVertical: 16, paddingHorizontal: 18, gap: space.gapSm },
  text: { gap: space.gapSm },
  kickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  chip: { borderRadius: radii.pill, paddingHorizontal: space.gapMd, paddingVertical: 4, flexShrink: 0 },
  buttonsRow: { flexDirection: 'row', gap: space.gapSm },
  buttonsStacked: { gap: space.gapSm },
  radio: { minHeight: space.touchMin, borderRadius: radii.pill, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gapMd },
  radioRow: { flex: 1 },
  radioStacked: { alignSelf: 'stretch' },
});
