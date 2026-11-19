// 09-22 (UI-SPEC 11, D-34, D-35): one feature and its switch. Only the first failing reason shows, in the order plan,
// household, level. A feature holding the person's records says it stays on. Disabled rows stay focusable so the reason is heard.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { ToggleRow } from '@/ui/ToggleRow';
import { rowHeight, space } from '@/theme/layout';
import type { FeatureAccess } from '../evaluateAccess';
import type { FeatureId } from '../featureRegistry';

type L = (key: string, params?: Record<string, string | number>) => string;

export interface FeatureRowProps {
  access: FeatureAccess;
  /** Switch change: the id, the new value and the value before. */
  onChange: (id: FeatureId, next: boolean, previous: boolean) => void;
  /** "Set up sharing" (only offered on the household reason, where it can be fixed). */
  onSetUpSharing?: () => void;
}

/** The one reason line a row shows, or null (D-35 order is already applied by evaluateAccess). */
export function reasonKey(a: FeatureAccess): 'plan' | 'household' | 'level' | 'holdsData' | null {
  if (a.reason !== null) return a.reason;
  return a.holdsData ? 'holdsData' : null;
}

export function FeatureRow({ access, onChange, onSetUpSharing }: FeatureRowProps) {
  const t = useT() as unknown as L;
  const label = t(`features.items.${access.id}.label`);
  const sub = t(`features.items.${access.id}.sub`);
  const why = reasonKey(access);
  const reason = why === null ? null : t(`features.reasons.${why}`);
  // The reason is part of the spoken label (UI-SPEC accessibility); the switch role and checked state say on or off.
  const spoken = reason === null ? label : `${label}, ${reason}`;
  const disabled = !access.switchable;
  return (
    <View style={styles.row}>
      <ToggleRow
        label={label}
        sub={reason === null ? sub : `${sub}\n${reason}`}
        accessibilityLabel={spoken}
        value={access.on}
        disabled={disabled}
        onChange={(next) => onChange(access.id, next, access.on)}
      />
      {why === 'household' && onSetUpSharing !== undefined ? (
        <View style={styles.link}>
          <PlanLink label={t('features.reasons.setUpSharing')} onPress={onSetUpSharing} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: rowHeight.two, justifyContent: 'center' },
  link: { paddingBottom: space.gapSm },
});
