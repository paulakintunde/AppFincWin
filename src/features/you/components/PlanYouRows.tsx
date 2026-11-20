// 09-15 (UI-SPEC Navigation and Entry Points): the You rows added by Phase 9. Live sublabels in the HouseholdYouRow pattern.
// FreeHelpYouRow never reads plan state: Free help is always open (D-03, T-09-55).
import type { ReactNode } from 'react';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { useAllFeatureAccess, useUserSetup } from '@/features/levels/useFeatureAccess';
import { LEVELS } from '@/features/levels/featureRegistry';
import { formatPlanDate } from '@/features/plans/formatPlanDate';
import { usePlanState } from '@/features/plans/usePlanState';
import { useTranslation } from 'react-i18next';

/** "Free trial · ends Dec 4", "Active · renews Jan 9", "Read-only", "Covered by Sam", "Free access"; nothing before a plan. */
export function SubscriptionYouRow({ tile, onPress }: { tile: ReactNode; onPress: () => void }) {
  const t = useT();
  const { i18n } = useTranslation();
  const plan = usePlanState();
  let sublabel: string | undefined;
  if (plan.status === 'tester') sublabel = t('appLife.status.freeAccess');
  else if (plan.status === 'locked') sublabel = t('plans.subscription.sublabel.readOnly');
  else if (plan.status === 'trial' || plan.status === 'active' || plan.status === 'grace') {
    if (!plan.payerIsMe && plan.payerName) sublabel = t('plans.subscription.sublabel.covered', { name: plan.payerName });
    else if (plan.status === 'trial') sublabel = t('plans.subscription.sublabel.trial', { date: formatPlanDate(plan.trialEndsAt, i18n.language) });
    else if (plan.status === 'grace') sublabel = t('appLife.status.paymentFailed');
    else sublabel = t('plans.subscription.sublabel.active', { date: formatPlanDate(plan.coveredUntil, i18n.language) });
  }
  return <Row label={t('plans.subscription.title')} sublabel={sublabel} leading={tile} chevron onPress={onPress} />;
}

/** "<Level> · <n> of <total> on". The level reads as Everything while it is unknown, so nothing looks hidden by a gap. */
export function FeaturesYouRow({ tile, onPress }: { tile: ReactNode; onPress: () => void }) {
  const t = useT();
  const access = useAllFeatureAccess();
  const setup = useUserSetup();
  const level = setup.data?.level ?? 4;
  const key = LEVELS.find((l) => l.level === level)?.key ?? 'everything';
  const on = access.filter((a) => a.on).length;
  return (
    <Row
      label={t('features.title')}
      sublabel={t('features.sublabel', { level: t(`features.levels.${key}.name`), count: on, total: access.length })}
      leading={tile}
      chevron
      onPress={onPress}
    />
  );
}

export function FreeHelpYouRow({ tile, onPress }: { tile: ReactNode; onPress: () => void }) {
  const t = useT();
  return <Row label={t('plans.freeHelp.row')} sublabel={t('plans.freeHelp.sub')} leading={tile} chevron onPress={onPress} />;
}

export function ExportYouRow({ tile, onPress }: { tile: ReactNode; onPress: () => void }) {
  const t = useT();
  return <Row label={t('plans.export.youRow')} leading={tile} chevron onPress={onPress} />;
}
