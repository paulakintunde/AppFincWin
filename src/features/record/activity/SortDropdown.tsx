// ACT-09: the Activity sort menu (UI-SPEC 2). Sort orders rows inside each group.
import React from 'react';
import { SORT_KEYS, type SortKey } from '@/engine/activity';
import { useT } from '@/i18n';
import { Dropdown, type DropdownOption } from '@/ui/Dropdown';

export interface SortDropdownProps {
  value: SortKey;
  onSelect: (sort: SortKey) => void;
}

export function SortDropdown({ value, onSelect }: SortDropdownProps) {
  const t = useT();
  const options: DropdownOption<SortKey>[] = SORT_KEYS.map((key) => ({ key, label: t(`activity.sort.${key}`) }));
  return (
    <Dropdown
      title={t('activity.sort.title')}
      options={options}
      value={value}
      onSelect={onSelect}
      triggerA11yLabel={t('activity.sort.triggerA11y', { sort: t(`activity.sort.${value}`) })}
    />
  );
}
