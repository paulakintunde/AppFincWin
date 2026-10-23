// 05-21 (DCU-01, DCU-03, DCU-04): the Decide tab root. Order per UI-SPEC: the quick check first, then Open checks, the
// Past decisions row and the sources note. 05-27 places Your month under the quick check and Lines you will not cross
// under the Past decisions row. No pull-to-refresh on Decide (no refreshKeys).
import React, { useCallback, useMemo, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { StyleSheet, View } from 'react-native';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useDecideChanges } from '@/data/queries/decide';
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
import { AddChangeRow } from './AddChangeRow';
import { ChangeSheet } from './ChangeSheet';
import { ChangesCard } from './ChangesCard';
import { checkHref, openNewCheck, PAST_HREF } from './checkHref';
import { LinesCard } from './LinesCard';
import { OpenChecksCard } from './OpenChecksCard';
import { RoughFiguresSheet } from './RoughFiguresSheet';
import { useDecideHomeViewModel } from './useDecideHomeViewModel';
import { YourMonthCard } from './YourMonthCard';

export function DecideHomeScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const vm = useDecideHomeViewModel();
  const { create } = useCreateCheck();
  const changes = useDecideChanges(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const [roughOpen, setRoughOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const noChanges = (changes ?? []).length === 0;
  const noLiveOpen = !vm.openChecks.some((c) => c.status === 'open' && c.deleted_at === null);

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

  const pastCount = t('decide.home.pastCount', { count: vm.decidedCount });
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
          onAddRough={() => setRoughOpen(true)}
          onRetry={vm.retry}
        />
        <AddChangeRow
          showAdd={noChanges}
          showInvest={noLiveOpen}
          onAdd={() => setAddOpen(true)}
          onInvest={() => openNewCheck('invest')}
        />
        <YourMonthCard
          source={vm.source}
          settings={vm.settings}
          userId={rc.userId}
          whole={vm.whole}
          onEditRough={() => setRoughOpen(true)}
        />
        <OpenChecksCard
          source={vm.source}
          checks={vm.openChecks}
          today={vm.today}
          whole={vm.whole}
          currency={vm.currency}
        />
        <ChangesCard changes={changes ?? []} currency={vm.currency} whole={vm.whole} />
        {vm.decidedCount > 0 ? (
          <Card style={{ paddingVertical: 0 }}>
            <Row
              label={t('decide.home.pastRow')}
              value={pastCount}
              accessibilityLabel={`${t('decide.home.pastRow')}, ${pastCount}`}
              chevron
              onPress={() => pushOnce(PAST_HREF)}
            />
          </Card>
        ) : null}
        <LinesCard source={vm.source} settings={vm.settings} userId={rc.userId} currency={vm.currency} whole={vm.whole} />
        {sources !== null ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sources}</Text>
        ) : null}
      </View>
      <ChangeSheet visible={addOpen} row={null} onClose={() => setAddOpen(false)} />
      <RoughFiguresSheet
        visible={roughOpen}
        userId={rc.userId}
        currency={vm.currency}
        settings={vm.settings}
        onClose={() => setRoughOpen(false)}
      />
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, gap: space.groupGap },
});
