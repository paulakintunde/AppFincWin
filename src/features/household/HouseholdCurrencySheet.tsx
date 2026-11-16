// Screen 1, owner: the currency shared amounts are shown and settled in (D-08). The server refuses a change while shared
// lines exist (they are recorded in the old currency); the sheet says so in plain words. Needs a connection.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { hapticFailed, hapticTap, hapticTick } from '@/ui/haptics';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { setHouseholdCurrency } from '@/db/householdMembers';
import { ISO_CURRENCIES } from '@/engine/money';
import { supabase } from '@/services/supabase';
import { useHouseholdScope } from './useHouseholdScope';
import { ownerReasonKey, type OwnerReasonKey } from './ownerReasons';

export interface HouseholdCurrencySheetProps {
  visible: boolean;
  onClose: () => void;
}

type Failure = OwnerReasonKey | 'household.home.currencySheet.sharedLinesExist';

export function HouseholdCurrencySheet({ visible, onClose }: HouseholdCurrencySheetProps) {
  // The body mounts once per opening, so the pick starts from the stored currency each time.
  if (!visible) return null;
  return <CurrencyBody onClose={onClose} />;
}

function CurrencyBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const scope = useHouseholdScope();
  const current = scope.household?.reporting_currency ?? null;
  const [picked, setPicked] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  if (!scope.isOwner) return null;

  const save = async () => {
    if (saving || !picked || picked === current || !scope.online) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await setHouseholdCurrency(supabase, picked);
      if (!res.ok) {
        hapticFailed();
        setFailure(res.reason === 'shared_lines_exist' ? 'household.home.currencySheet.sharedLinesExist' : ownerReasonKey(res.reason));
        return;
      }
      if (scope.householdId) void qc.invalidateQueries({ queryKey: queryKeys.householdDetail(scope.householdId) });
      hapticTap();
      showToast({ kind: 'ordinary', text: { key: 'household.home.currencySheet.saved', params: { code: picked } } });
      onClose();
    } catch {
      hapticFailed();
      setFailure('household.home.reasons.failed');
    } finally {
      setSaving(false);
    }
  };

  const title = t('household.home.currencySheet.title');
  const muted = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dismissible={!saving}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={muted}>{t('household.home.currencySheet.helper')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={title}>
          {ISO_CURRENCIES.map((c) => (
            <Row
              key={c.code}
              dense
              label={`${c.code} · ${c.name}`}
              selected={picked === c.code}
              leading={<RadioDot selected={picked === c.code} />}
              onPress={() => {
                hapticTick();
                setPicked(c.code);
              }}
            />
          ))}
        </View>
        {!scope.online ? <Text style={muted}>{t('household.home.offline.helper')}</Text> : null}
        {failure ? (
          <Text
            accessibilityRole="alert"
            testID="currency-failure"
            style={{ ...textRole(pairing, 'label'), color: failure === 'household.home.currencySheet.sharedLinesExist' ? colors.ink : colors.danger }}
          >
            {failure === 'household.home.currencySheet.sharedLinesExist' ? t(failure, { currency: current ?? '' }) : t(failure)}
          </Text>
        ) : null}
        <Pill
          label={t('household.home.currencySheet.save')}
          variant="primary"
          onPress={() => void save()}
          disabled={!picked || picked === current || !scope.online}
          pending={saving}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
});
