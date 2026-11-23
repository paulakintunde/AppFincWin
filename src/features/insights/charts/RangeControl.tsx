// 07-08: the one range control for Insights (6M / 1Y / All). Read-only screen: no haptic.
import React from 'react';
import type { InsightsRange } from '@/engine/insights';
import { useT } from '@/i18n';
import { SegmentedControl } from '@/ui/SegmentedControl';

export function RangeControl({ value, onChange }: { value: InsightsRange; onChange: (r: InsightsRange) => void }) {
  const t = useT();
  const options = [
    { key: '6m', label: t('insights.range.sixMonths'), a11yLabel: t('insights.range.sixMonthsA11y') },
    { key: '1y', label: t('insights.range.oneYear'), a11yLabel: t('insights.range.oneYearA11y') },
    { key: 'all', label: t('insights.range.all'), a11yLabel: t('insights.range.allA11y') },
  ];
  return <SegmentedControl options={options} value={value} onChange={(k) => onChange(k as InsightsRange)} accessibilityLabel={t('insights.range.label')} haptic={false} />;
}
