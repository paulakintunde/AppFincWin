// A generic single-choice sheet: a title and one Row per option, the current choice marked
// by Row's value text (payment type, currency). Used wherever a field has a short list.
import React from 'react';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { useT } from '@/i18n';

export interface OptionPickerProps<T extends string> {
  visible: boolean;
  title: string;
  options: readonly { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
}

export function OptionPicker<T extends string>({ visible, title, options, selected, onSelect, onClose }: OptionPickerProps<T>) {
  const t = useT();
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        {options.map((option) => (
          <Row
            key={option.value}
            label={option.label}
            dense
            chevron={false}
            value={option.value === selected ? '✓' : undefined}
            accessibilityLabel={option.label}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}
