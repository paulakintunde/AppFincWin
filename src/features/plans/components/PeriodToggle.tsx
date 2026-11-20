// 09-14: Monthly / Yearly (UI-SPEC section 5). Both prices print on every card; this only picks which is large and what the button buys.
import { useT } from '@/i18n';
import { SegmentedControl } from '@/ui/SegmentedControl';
import type { PlanPeriod } from '../types';

export function PeriodToggle({ value, onChange }: { value: PlanPeriod; onChange: (period: PlanPeriod) => void }) {
  const t = useT();
  return (
    <SegmentedControl
      accessibilityLabel={`${t('plans.paywall.period.monthly')} / ${t('plans.paywall.period.yearly')}`}
      options={[
        { key: 'month', label: t('plans.paywall.period.monthly') },
        { key: 'year', label: t('plans.paywall.period.yearly') },
      ]}
      value={value}
      onChange={(key) => onChange(key === 'month' ? 'month' : 'year')}
    />
  );
}
