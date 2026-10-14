// D-11/D-12: one quick menu for the whole app; it absorbs Activity's Add sheet. Entries come from
// feature registrations (03-15 Record, Phase 5 Decide), so an unregistered entry never appears.
import React from 'react';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useFab } from './FabProvider';

export function FabQuickMenu(): React.JSX.Element {
  const t = useT();
  const { quickMenuOpen, closeQuickMenu, quickActions } = useFab();
  // Close first, run on the next frame: an entry sheet must not open as a sibling of a closing
  // Modal (02.3 Pattern 4, D-28).
  const choose = (run: () => void): void => {
    closeQuickMenu();
    requestAnimationFrame(run);
  };
  return (
    <Sheet visible={quickMenuOpen} onDismiss={closeQuickMenu} accessibilityLabel={t('shell.quick.title')}>
      <SheetHeader
        title={t('shell.quick.title')}
        cancelLabel={t('record.sheet.cancel')}
        onCancel={closeQuickMenu}
      />
      {quickActions.map((a) => (
        <Row key={a.id} label={a.label} onPress={() => choose(a.run)} />
      ))}
    </Sheet>
  );
}
