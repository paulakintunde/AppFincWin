// 05-21 (DCU-01, DCU-03, DCU-04): the Decide tab root. Order per UI-SPEC: the quick check first, then Open checks, the
// Past decisions row and the sources note. 05-27 places Your month under the quick check and Lines you will not cross
// under the Past decisions row. No pull-to-refresh on Decide (no refreshKeys).
import React, { useCallback, useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import { StyleSheet, View } from 'react-native';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { useRegisterFab } from '@/shell/fab/FabProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { Card } from '../check/steps/stepUi';
import { QuickCheckForm } from '../quick/QuickCheckForm';
import type { CheckInputs } from '../snapshot/types';
import { checkHref, openNewCheck, PAST_HREF } from './checkHref';
import { OpenChecksCard } from './OpenChecksCard';
import { useDecideHomeViewModel } from './useDecideHomeViewModel';

export function DecideHomeScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const vm = useDecideHomeViewModel();
  const { create } = useCreateCheck();

  const fab = useMemo(
    () => ({
      label: t('decide.fab.label'),
      accessibilityLabel: t('decide.fab.a11y'),
      onPress: () => openNewCheck('buy'),
    }),
    [t]
  );
  useRegisterFab(fab);

  // D-23: "Run the full check" saves the quick-check fields as a new check and opens it at step 2.
  const runFull = useCallback(
    (inputs: CheckInputs) => {
      if (rc.userId === null || rc.householdId === null) return;
      const id = Crypto.randomUUID();
      create({
        userId: rc.userId,
        id,
        householdId: rc.householdId,
        kind: 'buy',
        name: inputs.name,
        inputs: inputs as unknown as Record<string, unknown>,
        furthestStep: 2,
      });
      pushOnce(checkHref(id, { step: '2' }));
    },
    [create, rc.userId, rc.householdId]
  );

  const meta = vm.source !== null && vm.source.kind === 'logged' ? vm.source.meta : null;
  const sources =
    meta !== null
      ? t('decide.home.sources', {
          months: meta.fullMonths,
          lines: meta.expenseLinesThisMonth,
          debts: meta.debtCount,
          accounts: meta.accountCount,
        })
      : vm.source !== null && vm.source.kind === 'rough'
        ? t('decide.home.sourcesRough')
        : null;

  return (
    <TabRootScreen title={t('decide.tab.title')} eyebrow={t('decide.tab.eyebrow')}>
      <View style={styles.body}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.tab.subtitle')}</Text>
        <QuickCheckForm
          surface="home"
          source={vm.source}
          sourceStatus={vm.status}
          today={vm.today}
          currency={vm.currency}
          onRunFull={runFull}
          onRetry={vm.retry}
        />
        <OpenChecksCard
          source={vm.source}
          checks={vm.openChecks}
          today={vm.today}
          whole={vm.whole}
          currency={vm.currency}
        />
        <Card style={{ paddingVertical: 0 }}>
          <Row
            label={t('decide.home.pastRow')}
            value={vm.decidedCount > 0 ? t('decide.home.pastCount', { count: vm.decidedCount }) : t('decide.home.pastNone')}
            chevron
            onPress={() => pushOnce(PAST_HREF)}
          />
        </Card>
        {sources !== null ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sources}</Text>
        ) : null}
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, gap: space.groupGap },
});
