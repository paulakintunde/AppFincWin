/**
 * 05-16 (D-18): the "Just me" / household scope control, the share line and the "Split for this purchase" row. Presentational:
 * the flow screen passes the member count (useHouseholdMemberNames(householdId).size). With one member or fewer it renders
 * nothing, so every Phase 5 household sees personal scope only; Phase 8 adds members and this appears with no change here.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import type { CheckInputs } from '../snapshot/types';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { SplitOverrideSheet } from './SplitOverrideSheet';

export interface ScopeToggleProps {
  memberCount: number;
  householdName: string;
  inputs: CheckInputs;
  update: (patch: Partial<CheckInputs>) => void;
  /** The user's share as display text, e.g. "50%". */
  sharePct: string;
  /** Currency for the Set amounts rows. */
  currency: string;
  /** One display name per member, in member order. */
  memberNames: readonly string[];
  readOnly?: boolean;
}

export function ScopeToggle({ memberCount, householdName, inputs, update, sharePct, currency, memberNames, readOnly = false }: ScopeToggleProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [sheet, setSheet] = useState(false);
  if (memberCount <= 1) return null;

  const household = inputs.scope === 'household';
  const kind = inputs.split?.kind ?? 'even';
  const shareLine = kind === 'mine' ? t('decide.scope.mine') : kind === 'even' ? t('decide.scope.split', { count: memberCount, pct: sharePct }) : null;

  return (
    <View style={styles.column}>
      <SegmentedToggle
        accessibilityLabel={t('decide.scope.override')}
        value={household ? 'household' : 'personal'}
        onChange={(key) => {
          if (!readOnly) update({ scope: key === 'household' ? 'household' : 'personal' });
        }}
        options={[
          { key: 'personal', label: t('decide.scope.me') },
          { key: 'household', label: householdName },
        ]}
      />
      {household ? (
        <>
          {shareLine ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{shareLine}</Text> : null}
          {!readOnly ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('decide.scope.override')}
              onPress={() => setSheet(true)}
              style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.scope.override')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      <SplitOverrideSheet
        visible={sheet}
        split={inputs.split}
        memberNames={memberNames}
        currency={currency}
        onSave={(split) => {
          setSheet(false);
          update({ split });
        }}
        onCancel={() => setSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
  row: { minHeight: space.touchMin, justifyContent: 'center' },
});
