// Non-archived accounts as one Row each. `excludeId` hides the other side of a transfer so
// both sides can never be the same account.
import React from 'react';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { useT } from '@/i18n';
import type { AccountRow } from '@/db/rows';

export interface AccountPickerProps {
  visible: boolean;
  title: string;
  accounts: readonly Pick<AccountRow, 'id' | 'name' | 'currency' | 'archived_at'>[];
  selectedId: string | null;
  excludeId?: string | null;
  onSelect: (account: { id: string; currency: string; name: string }) => void;
  onClose: () => void;
}

export function AccountPicker({ visible, title, accounts, selectedId, excludeId, onSelect, onClose }: AccountPickerProps) {
  const t = useT();
  const shown = accounts.filter((a) => a.archived_at === null && a.id !== excludeId);
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        {shown.map((account) => (
          <Row
            key={account.id}
            label={account.name}
            dense
            value={account.id === selectedId ? `${account.currency} ✓` : account.currency}
            accessibilityLabel={account.name}
            onPress={() => onSelect({ id: account.id, currency: account.currency, name: account.name })}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}
