// 10-22 (UI-SPEC section 5, item 3): the sheet behind a kind row. Amount kinds take a home-currency amount (integer minor
// units through MoneyInput, saved on blur); bills due takes a lead time.
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { AlertKind, AlertSetting } from '@/db/alerts';
import { currencyCode, minorUnits, type Money } from '@/engine/money';
import type { SuggestedAmount } from '@/engine/alerts';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { showToast } from '@/state/undoToast';
import { MoneyInput } from '@/ui/MoneyInput';
import { RadioDot } from '@/ui/RadioDot';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { hapticTick } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface AlertKindSheetProps {
  kind: AlertKind | null;
  setting: AlertSetting | null;
  /** Suggested amount for large_txn / low_balance. */
  suggested: SuggestedAmount | null;
  homeCurrency: string;
  formatMoney: (money: Money) => string;
  /** Over cap needs the caps feature. */
  disabled?: boolean;
  onToggle: (kind: AlertKind, next: boolean) => void;
  onSave: (kind: AlertKind, patch: { thresholdMinor?: number; thresholdCurrency?: string; leadDays?: 0 | 1 | 3 }) => void;
  onClose: () => void;
}

const KIND_NAME: Record<AlertKind, string> = {
  bills_due: 'system.alerts.kind.billsDue',
  goal_reached: 'system.alerts.kind.goalReached',
  over_cap: 'system.alerts.kind.overCap',
  large_txn: 'system.alerts.kind.largeTransaction',
  low_balance: 'system.alerts.kind.lowBalance',
};

const LEADS: readonly { days: 0 | 1 | 3; key: string }[] = [
  { days: 0, key: 'system.alerts.leadSame' },
  { days: 1, key: 'system.alerts.leadOne' },
  { days: 3, key: 'system.alerts.leadThree' },
];

export function AlertKindSheet(props: AlertKindSheetProps) {
  // The body mounts once per opening so the draft starts from the saved amount.
  if (props.kind === null || props.setting === null) return null;
  return <Body {...props} kind={props.kind} setting={props.setting} />;
}

function Body({
  kind,
  setting,
  suggested,
  homeCurrency,
  formatMoney,
  disabled = false,
  onToggle,
  onSave,
  onClose,
}: AlertKindSheetProps & { kind: AlertKind; setting: AlertSetting }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const isAmount = kind === 'large_txn' || kind === 'low_balance';
  // 10-review (D-4): a saved amount in another currency is not shown as if it were in the home currency; the field starts
  // from the home-currency suggestion instead, and nothing is saved until the person changes it.
  const savedInHome = setting.thresholdMinor !== null && setting.thresholdCurrency === homeCurrency;
  const startMinor = savedInHome ? setting.thresholdMinor : (suggested?.minor ?? null);
  const [draft, setDraft] = useState<number | null>(startMinor);
  const lastSaved = useRef<number | null>(startMinor);
  const title = t(KIND_NAME[kind] as never);
  const muted = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const saveAmount = (minor: number | null) => {
    if (minor === null || !Number.isSafeInteger(minor) || minor <= 0) return;
    if (minor === setting.thresholdMinor && setting.thresholdCurrency === homeCurrency) return;
    lastSaved.current = minor;
    onSave(kind, { thresholdMinor: minor, thresholdCurrency: homeCurrency });
    showToast({ kind: 'info', text: { key: 'system.alerts.saved' } });
  };

  // 10-review (D-4): blur saves only a value the person changed.
  const onBlur = () => {
    if (draft !== lastSaved.current) saveAmount(draft);
  };

  let meta: string | null = null;
  if (isAmount && suggested) {
    const amount = formatMoney({ amount: minorUnits(suggested.minor), currency: currencyCode(homeCurrency) });
    if (suggested.basis === 'history') {
      meta = t((kind === 'large_txn' ? 'system.alerts.suggestedLarge' : 'system.alerts.suggestedLow') as never, { amount });
    } else {
      meta = t('system.alerts.flatStart', { amount });
    }
  }

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('system.alerts.done')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <ToggleRow
          label={title}
          value={setting.enabled}
          disabled={disabled}
          accessibilityLabel={t(setting.enabled ? 'system.alerts.a11yKindOn' : 'system.alerts.a11yKindOff', { kind: title })}
          onChange={(next) => {
            hapticTick();
            onToggle(kind, next);
          }}
        />
        {isAmount ? (
          <View style={styles.block}>
            <MoneyInput
              value={draft}
              currency={homeCurrency}
              label={t('system.alerts.amountLabel')}
              accessibilityLabel={`${title}, ${t('system.alerts.amountLabel')}`}
              boxed
              onChange={setDraft}
              onBlur={onBlur}
            />
            {meta ? <Text style={muted}>{meta}</Text> : null}
            {suggested ? (
              <PlanLink
                label={t('system.alerts.useSuggested')}
                testID="alert-use-suggested"
                onPress={() => {
                  hapticTick();
                  setDraft(suggested.minor);
                  saveAmount(suggested.minor);
                }}
              />
            ) : null}
          </View>
        ) : null}
        {kind === 'bills_due' ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('system.alerts.leadGroup')}>
            {LEADS.map((l) => {
              const on = (setting.leadDays ?? 1) === l.days;
              return (
                <Row
                  key={l.days}
                  dense
                  label={t(l.key as never)}
                  selected={on}
                  leading={<RadioDot selected={on} />}
                  onPress={() => {
                    hapticTick();
                    onSave(kind, { leadDays: l.days });
                  }}
                />
              );
            })}
          </View>
        ) : null}
        {disabled ? <Text style={muted}>{t('system.alerts.needsCaps')}</Text> : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
  block: { gap: space.gapSm },
});
