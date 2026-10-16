/**
 * 05-16 (D-18): the "Split for this purchase" sheet. Even / By weight / Set amounts / All mine as radio rows; weights and
 * amounts are asked one per member. Built now, shown only through ScopeToggle, which renders nothing until a household has
 * more than one member (Phase 8). Cancel discards; a swipe, back or backdrop on a dirty sheet asks first (03 D-26).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import type { CheckInputs } from '../snapshot/types';
import { MoneyInput } from '../ui/MoneyInput';
import { Box, Label } from './steps/stepUi';

type Split = NonNullable<CheckInputs['split']>;
type Kind = Split['kind'];

const KINDS = [
  { kind: 'even', key: 'decide.scope.even' },
  { kind: 'weight', key: 'decide.scope.weight' },
  { kind: 'amount', key: 'decide.scope.amounts' },
  { kind: 'mine', key: 'decide.scope.allMine' },
] as const satisfies readonly { kind: Kind; key: string }[];

export interface SplitOverrideSheetProps {
  visible: boolean;
  split: CheckInputs['split'];
  memberNames: readonly string[];
  currency: string;
  onSave: (split: Split) => void;
  onCancel: () => void;
}

interface Draft {
  kind: Kind;
  weights: string[];
  amounts: (number | null)[];
}

const WEIGHT_MAX = 9999;

function toDraft(split: CheckInputs['split'], count: number): Draft {
  const weights = Array.from({ length: count }, (_, i) => String(split?.weights[i] ?? 1));
  const amounts = Array.from({ length: count }, (_, i) => split?.amounts[i] ?? null);
  return { kind: split?.kind ?? 'even', weights, amounts };
}

export function SplitOverrideSheet(props: SplitOverrideSheetProps) {
  // The form mounts per opening so every field starts from the stored split.
  return props.visible ? <SplitForm {...props} /> : null;
}

function SplitForm({ split, memberNames, currency, onSave, onCancel }: SplitOverrideSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [start] = useState<Draft>(() => toDraft(split, memberNames.length));
  const [draft, setDraft] = useState<Draft>(start);
  const dirty = useIsDirty(start, draft);
  const title = t('decide.scope.override');

  const save = () => {
    const weights = draft.weights.map((w) => {
      const n = parseInt(w.replace(/\D/g, ''), 10);
      return Number.isSafeInteger(n) ? Math.min(n, WEIGHT_MAX) : 0;
    });
    const amounts = draft.amounts.map((a) => a ?? 0);
    onSave({
      kind: draft.kind,
      weights: draft.kind === 'weight' ? weights : [],
      amounts: draft.kind === 'amount' ? amounts : [],
    });
  };

  return (
    <Sheet visible onDismiss={onCancel} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.scope.cancel')} onCancel={onCancel} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View accessibilityRole="radiogroup" accessibilityLabel={title}>
          {KINDS.map((k) => {
            const selected = draft.kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={t(k.key)}
                onPress={() => setDraft((d) => ({ ...d, kind: k.kind }))}
                style={({ pressed }) => [styles.radio, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <View style={[styles.dot, { borderColor: selected ? colors.ink : colors.line4, backgroundColor: selected ? colors.ink : 'transparent' }]} />
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(k.key)}</Text>
              </Pressable>
            );
          })}
        </View>

        {draft.kind === 'weight'
          ? memberNames.map((name, i) => (
              <View key={name + i} style={styles.field}>
                <Label>{name}</Label>
                <Box
                  numeric
                  value={draft.weights[i] ?? ''}
                  onChangeText={(x) => setDraft((d) => ({ ...d, weights: d.weights.map((w, j) => (j === i ? x : w)) }))}
                  accessibilityLabel={`${t('decide.scope.weight')}, ${name}`}
                  maxLength={4}
                />
              </View>
            ))
          : null}

        {draft.kind === 'amount'
          ? memberNames.map((name, i) => (
              <MoneyInput
                key={name + i}
                value={draft.amounts[i] ?? null}
                currency={currency}
                onChange={(minor) => setDraft((d) => ({ ...d, amounts: d.amounts.map((a, j) => (j === i ? minor : a)) }))}
                label={name}
                accessibilityLabel={`${t('decide.scope.amounts')}, ${name}`}
              />
            ))
          : null}

        <Pill label={t('decide.scope.save')} variant="primary" onPress={save} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.cardPad },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  field: { gap: space.gapSm },
});
