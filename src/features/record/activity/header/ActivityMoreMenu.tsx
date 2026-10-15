// D-45 / D-63 / D-68: the More menu. Three groups separated by line1 dividers:
// (1) Select entries (not offered in Calendar), (2) Clone / Paste, (3) Accounts / History.
// Built on Sheet; ui/Dropdown untouched (it has no dividers and is shared by other menus).
// Choosing a row closes the menu first, then reports the choice.
import React from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { hapticSelection } from '@/ui/haptics';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';

export type MoreAction = 'select' | 'clone' | 'paste' | 'accounts' | 'history';

export interface ActivityMoreMenuProps {
  visible: boolean;
  onClose: () => void;
  calendar: boolean;
  prevMonthName: string;
  onSelect: (action: MoreAction) => void;
}

interface MoreItem {
  key: MoreAction;
  label: string;
  sublabel?: string;
}

export function ActivityMoreMenu({ visible, onClose, calendar, prevMonthName, onSelect }: ActivityMoreMenuProps) {
  const t = useT();
  const { colors } = useTheme();

  const groups: MoreItem[][] = [
    calendar ? [] : [{ key: 'select', label: t('activity.more.select') }],
    [
      ...(prevMonthName === ''
        ? []
        : [
            {
              key: 'clone' as const,
              label: t('activity.more.clone', { month: prevMonthName }),
              sublabel: t('activity.more.cloneSub'),
            },
          ]),
      { key: 'paste', label: t('activity.more.paste'), sublabel: t('activity.more.pasteSub') },
    ],
    [
      { key: 'accounts', label: t('activity.accounts') },
      { key: 'history', label: t('activity.history') },
    ],
  ].filter((g) => g.length > 0) as MoreItem[][];

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={t('activity.more.label')}>
      <SheetHeader title={t('activity.more.label')} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        {groups.map((group, i) => (
          <React.Fragment key={group[0]!.key}>
            {i > 0 ? (
              // 1 is a hairline, not a spacing token.
              <View testID="more-divider" style={{ height: 1, backgroundColor: colors.line1 }} />
            ) : null}
            {group.map((item) => (
              <Row
                key={item.key}
                label={item.label}
                sublabel={item.sublabel}
                onPress={() => {
                  hapticSelection();
                  onClose();
                  onSelect(item.key);
                }}
              />
            ))}
          </React.Fragment>
        ))}
      </SheetScroll>
    </Sheet>
  );
}
