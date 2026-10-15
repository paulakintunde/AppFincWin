// HOME-01..04 / D-30 / D-31: Home's first content. Order per D-30 (differs from the prototype's
// hero-first order, UI-SPEC deviation 8); no net-worth hero, health card or Coach until their phases.
import React, { useCallback, useState } from 'react';
import { router } from 'expo-router';
import type { ProjectionView } from '@/data/queries/activity';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { EMPTY_FILTER } from '@/engine/activity';
import { monthOf } from '@/engine/time';
import { ACTIVITY_HREF } from '@/features/auth/appHome';
import { EditScopePrompt } from '@/features/record/entry/EditScopePrompt';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import { TransactionDetailSheet } from '@/features/record/activity/TransactionDetailSheet';
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { requestActivityFocus } from '@/state/activityFocus';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { AccountsCard } from './AccountsCard';
import { ComingUpCard } from './ComingUpCard';
import { ProjectionDetailSheet } from './ProjectionDetailSheet';
import { QuickActions } from './QuickActions';
import { ThisMonthCard } from './ThisMonthCard';
import { useHomeViewModel } from './useHomeViewModel';

export function HomeScreen() {
  const t = useT();
  const vm = useHomeViewModel();
  const { rc, flow, formatter } = vm;
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const allAccounts = useAccounts(rc.householdId ?? undefined).data;
  const [projection, setProjection] = useState<ProjectionView | null>(null);

  const accountName = useCallback(
    (id: string): string => (allAccounts ?? []).find((a) => a.id === id)?.name ?? '',
    [allAccounts]
  );

  const today = rc.today;
  const eyebrow = new Intl.DateTimeFormat(formatter.locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
    .format(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)), 12))
    .toLocaleUpperCase(formatter.locale);

  const seeAll = () => {
    requestActivityFocus({ month: vm.month, filter: { ...EMPTY_FILTER, unpaidOnly: true } });
    router.navigate(ACTIVITY_HREF);
  };

  return (
    <TabRootScreen
      title={t('home.title')}
      eyebrow={eyebrow}
      refreshKeys={vm.refreshKeys}
      overlay={
        <>
          <TransactionDetailSheet {...flow.detail} today={rc.today} />
          <EditScopePrompt
            visible={flow.pendingDelete?.prompt === 'scope'}
            onThisOne={() => flow.answerDelete('one')}
            onThisAndFuture={() => flow.answerDelete('future')}
            onCancel={() => flow.answerDelete('cancel')}
          />
          <ConfirmSheet
            visible={flow.pendingDelete?.prompt === 'transferDelete'}
            body={t('record.sheet.transferDeleteConfirm', {
              from: accountName(flow.pendingDelete?.row.account_id ?? ''),
              to: accountName(flow.pendingDelete?.row.counterpartAccountId ?? ''),
            })}
            cancelLabel={t('activity.bulkDeleteCancel')}
            confirmLabel={t('activity.bulkDeleteProceed')}
            destructive
            onConfirm={() => flow.answerDelete('transfer')}
            onCancel={() => flow.answerDelete('cancel')}
          />
          <TransactionSheet
            visible={flow.entryMode !== null}
            mode={flow.entryMode ?? { kind: 'new', direction: 'out' }}
            onClose={() => flow.setEntryMode(null)}
          />
          <ProjectionDetailSheet
            projection={projection}
            visible={projection !== null}
            onDismiss={() => setProjection(null)}
            formatter={formatter}
            homeCurrency={rc.homeCurrency}
            categories={categories}
            accountName={accountName}
          />
        </>
      }
    >
      <QuickActions month={vm.month} />
      <ThisMonthCard
        position={vm.position}
        totals={vm.totals}
        month={vm.month}
        months={vm.months}
        onMonthChange={vm.setMonth}
        formatter={formatter}
        homeCurrency={rc.homeCurrency}
        currentMonth={monthOf(rc.today)}
        state={vm.dataState}
      />
      <ComingUpCard
        items={vm.comingUp}
        total={vm.comingUpTotal}
        month={vm.month}
        formatter={formatter}
        homeCurrency={rc.homeCurrency}
        categories={categories}
        state={vm.dataState}
        onPay={vm.rowActions.pay}
        onOpenRow={flow.openDetail}
        onOpenProjection={setProjection}
        onSeeAll={seeAll}
      />
      <AccountsCard
        accounts={vm.accounts}
        balances={vm.balances}
        homeCurrency={rc.homeCurrency}
        loading={vm.accountsLoading}
      />
    </TabRootScreen>
  );
}
