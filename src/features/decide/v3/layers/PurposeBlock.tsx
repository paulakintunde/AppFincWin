// 05.3-40 (D-10, UI-SPEC Purpose block): "What is this for you?" with the six presets in the fixed order, nothing selected by
// default, and the emergency follow-up after For work or income / A necessity. The follow-up shows whenever the engine's own
// canUseEmergency says the purpose can use it. Purpose and emergency only change the answer by enabling the emergency path.
import React from 'react';
import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { canUseEmergency } from '@/engine/decide/v3';
import type { CheckV2, Purpose } from '@/engine/decide/v3';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { useLooseT } from '../check/useLooseT';
import { withEmergency, withLayerAnswer, withPurpose } from '../model/checkEdits';
import { purposeOptions } from '../model/checkOptions';

export interface PurposeBlockProps {
  check: CheckV2;
  edit(next: CheckV2): void;
  readOnly?: boolean;
}

const NO_CUSTOM: readonly { id: string; label: string }[] = [];
const HALF: DimensionValue = '48%';
const NO_KEY = 'L1e.no';

interface ChoiceProps {
  label: string;
  selected: boolean;
  onPress(): void;
  width: DimensionValue | undefined;
  disabled: boolean;
}

function Choice({ label, selected, onPress, width, disabled }: ChoiceProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.choice,
        width === undefined ? styles.grow : { width },
        { backgroundColor: selected ? colors.ink : colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 },
      ]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.surface : colors.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function PurposeBlock({ check, edit, readOnly = false }: PurposeBlockProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const options = purposeOptions(check.purpose, NO_CUSTOM);
  const emergencyAsked = canUseEmergency(check.purpose);
  const width = stacked ? undefined : HALF;
  const pick = (p: Purpose): void => edit(withPurpose(check, p));
  // 'No' is a real answer, kept in layerAnswers so it can show selected while nothing is selected by default.
  const saidNo = !check.emergency && check.layerAnswers[NO_KEY] === true;

  return (
    <View testID="purpose-block" style={styles.block}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontWeight: '700', color: colors.ink }}>
        {t('decide.v3.ui.layers.purposeQuestion')}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.purposeQuestion')} style={styles.grid}>
        {options.map((o) => (
          <Choice
            key={o.ref.kind === 'preset' ? o.ref.value : o.ref.id}
            label={o.labelKey === null ? (o.label ?? '') : t(o.labelKey)}
            selected={o.selected}
            width={width}
            disabled={readOnly}
            onPress={() => pick(o.ref)}
          />
        ))}
      </View>
      {emergencyAsked ? (
        <View testID="emergency-tile" style={[styles.tile, { backgroundColor: warnTint }]}>
          <Text style={{ ...textRole(pairing, 'label'), fontWeight: '700', color: colors.ink }}>{t('decide.v3.ui.layers.emergencyQuestion')}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.emergencyQuestion')} style={styles.grid}>
            <Choice
              label={t('decide.v3.ui.layers.emergencyYes')}
              selected={check.emergency}
              width={width}
              disabled={readOnly}
              onPress={() => edit(withLayerAnswer(withEmergency(check, true), NO_KEY, undefined))}
            />
            <Choice
              label={t('decide.v3.ui.layers.emergencyNo')}
              selected={saidNo}
              width={width}
              disabled={readOnly}
              onPress={() => edit(withLayerAnswer(withEmergency(check, false), NO_KEY, true))}
            />
          </View>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{t('decide.v3.ui.layers.emergencyNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapMd },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm, justifyContent: 'space-between' },
  choice: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.gapMd, paddingVertical: space.gapSm, justifyContent: 'center', alignItems: 'center' },
  grow: { flexGrow: 1, flexBasis: '100%' },
  tile: { borderRadius: space.cardPad, padding: 14, gap: space.gapMd },
});
