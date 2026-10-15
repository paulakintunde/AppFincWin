// D-64 / D-68: one Display sheet with a View section and a Sort by section. Choosing a row
// applies it at once and keeps the sheet open; Done, backdrop, drag and Android back close it.
// The Sort section is not rendered in Calendar. Own Sheet, not @gorhom (Phase 3 re-discussion).
import React from 'react';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { RadioDot } from '@/ui/RadioDot';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { SORT_KEYS, type SortKey } from '@/engine/activity';
import type { ActivityView } from '../activityViewPrefs';

export interface DisplaySheetProps {
  visible: boolean;
  onClose: () => void;
  views: readonly ActivityView[];
  view: ActivityView;
  onViewChange: (view: ActivityView) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
}

export function DisplaySheet({ visible, onClose, views, view, onViewChange, sort, onSortChange }: DisplaySheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const heading = {
    ...textRole(pairing, 'label'),
    color: colors.inkMuted,
    paddingTop: space.gapMd,
    paddingBottom: space.gapSm,
  };

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={t('activity.display.title')}>
      <SheetHeader title={t('activity.display.title')} cancelLabel={t('activity.done')} onCancel={onClose} />
      <SheetScroll>
        <Text accessibilityRole="header" style={heading}>
          {t('activity.view.title')}
        </Text>
        {views.map((key) => (
          <Row
            key={key}
            label={t(`activity.view.${key}`)}
            sublabel={t(`activity.view.${key}Sub`)}
            leading={<RadioDot selected={key === view} />}
            selected={key === view}
            onPress={() => onViewChange(key)}
          />
        ))}
        {view !== 'calendar' ? (
          <>
            <Text accessibilityRole="header" style={heading}>
              {t('activity.sort.title')}
            </Text>
            {SORT_KEYS.map((key) => (
              <Row
                key={key}
                label={t(`activity.sort.${key}`)}
                leading={<RadioDot selected={key === sort} />}
                selected={key === sort}
                onPress={() => onSortChange(key)}
              />
            ))}
          </>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}
