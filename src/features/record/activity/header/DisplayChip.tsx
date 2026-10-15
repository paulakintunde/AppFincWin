// D-64: one Display chip replaces the View and Sort dropdowns. Reads '{view} · {sort}', or
// just 'Calendar' in Calendar (sort does not apply there). The accessible name contains the
// visible text (label-in-name).
import React from 'react';
import type { View } from 'react-native';
import { useT } from '@/i18n';
import { Chip } from '@/ui/Chip';
import type { SortKey } from '@/engine/activity';
import type { ActivityView } from '../activityViewPrefs';

export interface DisplayChipProps {
  view: ActivityView;
  sort: SortKey;
  onPress: () => void;
  chipRef?: React.Ref<View>;
}

export function DisplayChip({ view, sort, onPress, chipRef }: DisplayChipProps) {
  const t = useT();
  const viewName = t(`activity.view.${view}`);
  const sortName = t(`activity.sort.${sort}`);
  const calendar = view === 'calendar';
  const label = calendar ? viewName : t('activity.display.chip', { view: viewName, sort: sortName });
  const a11y = calendar
    ? t('activity.display.triggerA11yCalendar')
    : t('activity.display.triggerA11y', { view: viewName, sort: sortName });
  return <Chip label={label} accessibilityLabel={a11y} onPress={onPress} pressableRef={chipRef} />;
}
