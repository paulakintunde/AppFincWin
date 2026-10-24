/**
 * 05-109 (D-87, R16.3): a user-added running cost whose amount is empty behaves like a D-33 prompt row: the reserved checkbox
 * column stays empty, "Counted once an amount is typed" sits under the name, the dashed Amount field takes a press anywhere
 * on the row, and the R16.3 labels apply. A cost that already has an amount when it first shows is the plain checkbox row.
 * A row that began empty stays an Amount row for as long as it is mounted, so the field keeps its focus while the amount is
 * typed and the checkbox appears beside it.
 */
import React, { useState } from 'react';
import type { InputLine } from '../../../snapshot/types';
import { MAX_INPUT_MINOR } from '../../../snapshot/checkInputs';
import { AmountRow } from './AmountRow';

export interface UserCostRowProps {
  line: InputLine;
  name: string;
  currency: string;
  format: (minor: number) => string;
  readOnly: boolean;
  /** Replaces this line in the list. */
  onChange: (next: InputLine) => void;
  onRemove: () => void;
  removeA11yLabel: string;
  /** The plain checkbox row, shown for a cost that had an amount when it first appeared. */
  plain: React.ReactElement;
}

export function UserCostRow({ line, name, currency, format, readOnly, onChange, onRemove, removeA11yLabel, plain }: UserCostRowProps) {
  const [startedEmpty] = useState(line.amount <= 0);
  if (!startedEmpty) return plain;
  return (
    <AmountRow
      name={name}
      amount={line.amount}
      counted={line.counted}
      note={line.note}
      currency={currency}
      format={format}
      readOnly={readOnly}
      onAmountChange={(minor) => {
        const typed = minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null;
        onChange(typed === null ? { ...line, amount: 0, counted: false } : { ...line, amount: typed, counted: true });
      }}
      onToggleCounted={() => onChange({ ...line, counted: !line.counted })}
      onRemove={onRemove}
      removeA11yLabel={removeA11yLabel}
    />
  );
}
