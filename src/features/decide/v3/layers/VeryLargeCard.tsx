// 05.3-42 (DSV-06, D-18, T-05.3-42-03, UI-SPEC Very large purchase): funding sources, staged payments and the user's own
// statement that they have talked it over with a professional. Everything is stored under layerAnswers 'L7.*'; nothing
// here changes the answer. At band 15 staged payments are required, which this card only states (the answer does not move).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { ToggleRow } from '@/ui/ToggleRow';
import { useLooseT } from '../check/useLooseT';
import { withLayerAnswer } from '../model/checkEdits';
import { LayerCard } from './LayerCard';

export interface VeryLargeCardProps {
  check: CheckV2;
  edit(next: CheckV2): void;
  currency: string;
  /** True at the band where staged payments are required (stagedRequired). */
  stagedRequired: boolean;
  readOnly?: boolean;
}

interface SourceRow { readonly source: string; readonly amount: number | null }
interface StageRow { readonly date: string; readonly amount: number | null }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function rowsOf<T extends object>(v: unknown): readonly T[] {
  return Array.isArray(v) ? (v.filter((r) => typeof r === 'object' && r !== null) as T[]) : [];
}

function StageDate({ caption, stored, onValid, readOnly, testID }: { caption: string; stored: string; onValid(v: string): void; readOnly: boolean; testID: string }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const [text, setText] = useState(stored);
  return (
    <View style={styles.field}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{caption}</Text>
      <View style={[styles.box, { backgroundColor: colors.fill1 }]}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (ISO_DATE.test(v)) onValid(v);
          }}
          editable={!readOnly}
          inputMode="numeric"
          placeholder="2026-12-31"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={caption}
          testID={testID}
          style={{ ...textRole(pairing, 'label'), color: colors.ink, minHeight: space.touchMin, padding: 0 }}
        />
      </View>
    </View>
  );
}

export function VeryLargeCard({ check, edit, currency, stagedRequired, readOnly = false }: VeryLargeCardProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const sources = rowsOf<SourceRow>(check.layerAnswers['L7.sources']);
  const stages = rowsOf<StageRow>(check.layerAnswers['L7.stages']);
  const professional = check.layerAnswers['L7.professional'] === true;
  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };

  const setSources = (next: readonly SourceRow[]): void => edit(withLayerAnswer(check, 'L7.sources', next));
  const setStages = (next: readonly StageRow[]): void => edit(withLayerAnswer(check, 'L7.stages', next));
  const link = (text: string, onPress: () => void, testID: string): React.JSX.Element => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      testID={testID}
      disabled={readOnly}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.ink }}>{text}</Text>
    </Pressable>
  );

  return (
    <LayerCard eyebrowKey="decide.v3.ui.layers.veryLargeEyebrow" testID="very-large-card">
      <Text accessibilityRole="header" style={label}>{t('decide.v3.ui.layers.sources')}</Text>
      {sources.map((row, i) => (
        <View key={`source-${i}`} style={styles.row} testID={`source-row-${i}`}>
          <View style={[styles.box, { backgroundColor: colors.fill1 }]}>
            <TextInput
              value={row.source}
              onChangeText={(v) => setSources(sources.map((r, j) => (j === i ? { ...r, source: v } : r)))}
              editable={!readOnly}
              accessibilityLabel={t('decide.v3.ui.layers.sources')}
              testID={`source-name-${i}`}
              style={{ ...textRole(pairing, 'label'), color: colors.ink, minHeight: space.touchMin, padding: 0 }}
            />
          </View>
          <MoneyInput
            value={row.amount}
            currency={currency}
            onChange={(m) => setSources(sources.map((r, j) => (j === i ? { ...r, amount: m === null ? null : minorUnits(m) } : r)))}
            label={t('decide.v3.ui.layers.amount')}
            accessibilityLabel={t('decide.v3.ui.layers.amount')}
            readOnly={readOnly}
          />
        </View>
      ))}
      {link(t('decide.v3.ui.layers.addSource'), () => setSources([...sources, { source: '', amount: null }]), 'add-source')}

      <Text accessibilityRole="header" style={label}>{t('decide.v3.ui.layers.staged')}</Text>
      {stagedRequired ? <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.v3.ui.layers.stagedRequired')}</Text> : null}
      {stages.map((row, i) => (
        <View key={`stage-${i}`} style={styles.row} testID={`stage-row-${i}`}>
          <StageDate
            caption={t('decide.v3.ui.layers.date')}
            stored={row.date}
            readOnly={readOnly}
            testID={`stage-date-${i}`}
            onValid={(v) => setStages(stages.map((r, j) => (j === i ? { ...r, date: v } : r)))}
          />
          <MoneyInput
            value={row.amount}
            currency={currency}
            onChange={(m) => setStages(stages.map((r, j) => (j === i ? { ...r, amount: m === null ? null : minorUnits(m) } : r)))}
            label={t('decide.v3.ui.layers.amount')}
            accessibilityLabel={t('decide.v3.ui.layers.amount')}
            readOnly={readOnly}
          />
        </View>
      ))}
      {link(t('decide.v3.ui.layers.addStage'), () => setStages([...stages, { date: '', amount: null }]), 'add-stage')}

      <ToggleRow
        label={t('decide.v3.ui.layers.professional')}
        value={professional}
        disabled={readOnly}
        onChange={(next) => edit(withLayerAnswer(check, 'L7.professional', next))}
      />
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.v3.ui.layers.storedNote')}</Text>
    </LayerCard>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.gapSm },
  row: { gap: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  box: { minHeight: space.touchMin, borderRadius: space.cardPad, paddingHorizontal: space.gapMd, justifyContent: 'center' },
});
