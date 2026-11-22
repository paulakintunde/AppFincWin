// 08.1-25 (CMP-F19, owner one-earner fix 2026-11-21, Q2 A, Q4 A): the line on a member's own answer (Just me or Household) when their
// share of the joint money is $0 because of the group's rule (the engine's share_zero_by_rule caveat). It suggests the target in
// zeroShareSuggestion.ts and opens the set-shares editor pre-filled; nothing changes until someone presses Save there.
// "Not now" (Q4 A) hides it on this phone until next month; if it is still true then, it shows again. The key starts with `fincwin:`
// so wipeDeviceData() clears it on sign-out and account deletion. Device-local only. A failed read counts as not hidden.
// Not a verdict: no state colour, no new colour, no icon.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import { useT } from '@/i18n';
import type { Caveat } from '@/engine/decide/v3';
import { money } from '@/engine/money';
import { STORAGE_PREFIX } from '@/services/storage/wipe';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticTap } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { currentSuggestion } from '../rules/zeroShareSuggestion';

export function zeroShareNotNowKey(householdId: string): string {
  return `${STORAGE_PREFIX}zero-share-not-now:${householdId}`;
}

/** The month ('YYYY-MM') "Not now" was pressed in, or null. Never throws. */
export async function loadZeroShareNotNow(householdId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(zeroShareNotNowKey(householdId));
  } catch {
    return null;
  }
}

export async function markZeroShareNotNow(householdId: string, month: string): Promise<void> {
  try {
    await AsyncStorage.setItem(zeroShareNotNowKey(householdId), month);
  } catch {
    // A line that cannot be remembered as put away simply shows again.
  }
}

const RULE_NAME_KEYS: Readonly<Record<string, string>> = {
  bring: 'household.rules.spending.bring.label',
  bill: 'household.rules.spending.bill.label',
};

export interface ZeroShareLineProps {
  readonly householdId: string | null | undefined;
  readonly caveat: Caveat | undefined;
  readonly currency: string;
  /** today, 'YYYY-MM-DD' */
  readonly today: string;
}

export function ZeroShareLine({ householdId, caveat, currency, today }: ZeroShareLineProps) {
  const t = useT();
  const say = t as unknown as (key: string, values?: Readonly<Record<string, string | number>>) => string;
  const { colors, pairing } = useTheme();
  const whole = useMoneyFormatter(false);
  const month = today.slice(0, 7);
  // undefined = still reading; the line waits so it never flashes and then hides
  const [hiddenFor, setHiddenFor] = useState<string | null | undefined>(householdId ? undefined : null);
  useEffect(() => {
    if (!householdId) return;
    let live = true;
    void loadZeroShareNotNow(householdId).then((m) => {
      if (live) setHiddenFor(m);
    });
    return () => {
      live = false;
    };
  }, [householdId]);

  const ruleKey = RULE_NAME_KEYS[String(caveat?.values['rule'])];
  if (caveat === undefined || !householdId || ruleKey === undefined || hiddenFor === undefined || hiddenFor === month) return null;
  const s = currentSuggestion();
  const text = say(s.lineKey, { rule: say(ruleKey), zero: whole.formatMoney(money(0, currency)) });

  return (
    <View testID="zero-share-line" style={styles.wrap}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{text}</Text>
      <View style={styles.actions}>
        <Pill
          label={say(s.actionKey)}
          variant="secondary"
          onPress={() => {
            hapticTap();
            pushOnce(s.route as unknown as Href);
          }}
        />
        <Pill
          label={say('household.rules.zeroShare.notNow')}
          variant="secondary"
          onPress={() => {
            hapticTap();
            setHiddenFor(month);
            void markZeroShareNotNow(householdId, month);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: step.tight },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: step.tight },
});
