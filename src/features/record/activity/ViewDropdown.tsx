// ACT-06: the Activity view menu (UI-SPEC 1). The caller says which views exist, so adding
// Calendar later is a change to the array the screen passes, not to this file.
import React from 'react';
import { useT } from '@/i18n';
import { Dropdown, type DropdownOption } from '@/ui/Dropdown';
import type { ActivityView } from './activityViewPrefs';

export interface ViewDropdownProps {
  views: readonly ActivityView[];
  value: ActivityView;
  onSelect: (view: ActivityView) => void;
}

export function ViewDropdown({ views, value, onSelect }: ViewDropdownProps) {
  const t = useT();
  const options: DropdownOption<ActivityView>[] = views.map((key) => ({
    key,
    label: t(`activity.view.${key}`),
    subLabel: t(`activity.view.${key}Sub`),
    triggerLabel: key === 'balance' ? t('activity.view.balanceTrigger') : t(`activity.view.${key}`),
  }));
  const current = options.find((o) => o.key === value);
  return (
    <Dropdown
      title={t('activity.view.title')}
      options={options}
      value={value}
      onSelect={onSelect}
      triggerA11yLabel={t('activity.view.triggerA11y', { view: current?.triggerLabel ?? '' })}
    />
  );
}
