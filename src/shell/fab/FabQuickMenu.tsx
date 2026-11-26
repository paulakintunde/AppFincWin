// D-11/D-12: one quick menu for the whole app; it absorbs Activity's Add sheet. Entries come from
// feature registrations (03-15 Record, Phase 5 Decide), so an unregistered entry never appears.
import React from 'react';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useWriteGate, type LockActionId } from '@/features/plans/useWriteGate';
import { Glyph } from '@/ui/icons/Glyph';
import { useTheme } from '@/theme/ThemeProvider';
import { useFab } from './FabProvider';

// 09-17 (TIER-09): which write action each quick entry is, for the lock mark and spoken suffix.
const LOCK_ACTION: Record<string, LockActionId> = {
  addExpense: 'addTransaction',
  scanReceipt: 'addTransaction', // 10.1-25: a scan creates a line, so a locked plan marks it like Add expense
  addIncome: 'addTransaction',
  transfer: 'addTransaction',
  newCheck: 'newDecideCheck',
  importStatement: 'importStatement',
};

/** The row keeps its place when locked and gains the lock mark; the handler itself (registered by its host) opens the named sheet. */
function QuickRow({ id, label, onPress }: { id: string; label: string; onPress: () => void }): React.JSX.Element {
  const gate = useWriteGate(LOCK_ACTION[id] ?? 'addTransaction');
  const { colors } = useTheme();
  return (
    <Row
      label={label}
      accessibilityLabel={gate.a11ySuffix ? `${label}, ${gate.a11ySuffix}` : undefined}
      status={gate.gated ? <Glyph name="pinLock" size={16} color={colors.inkMuted} testID={`quick-menu-lock-${id}`} /> : undefined}
      onPress={onPress}
    />
  );
}

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
        <QuickRow key={a.id} id={a.id} label={a.label} onPress={() => choose(a.run)} />
      ))}
    </Sheet>
  );
}
