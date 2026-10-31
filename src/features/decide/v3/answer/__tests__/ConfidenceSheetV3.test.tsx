/** Plan 05.3-25: ConfidenceChipV3 and ConfidenceSheetV3. */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import type { Confidence } from '@/engine/decide/v3';
import { ConfidenceChipV3 } from '../ConfidenceChipV3';
import { ConfidenceSheetV3 } from '../ConfidenceSheetV3';
import { waiverRows } from '../../model/waiverNote';
import { fakeFormat } from './answerKit';
import { wrap } from './kit';

jest.setTimeout(60000);

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticWarning: jest.fn() }));

const FIRM: Confidence = { level: 'firm', reasons: [] };
const FAIR: Confidence = { level: 'fair', reasons: ['few_months'] };
const ROUGH: Confidence = { level: 'rough', reasons: ['rough_figures', 'few_months'] };

function Harness({ confidence }: { confidence: Confidence }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <ConfidenceChipV3 confidence={confidence} onPress={() => setOpen(true)} />
      <ConfidenceSheetV3 visible={open} confidence={confidence} onClose={() => setOpen(false)} />
    </>
  );
}

describe('ConfidenceChipV3', () => {
  it('is hidden for firm', async () => {
    await wrap(<ConfidenceChipV3 confidence={FIRM} onPress={jest.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reads Fair for fair', async () => {
    await wrap(<ConfidenceChipV3 confidence={FAIR} onPress={jest.fn()} />);
    expect(screen.getByText('Fair')).toBeTruthy();
  });

  it('reads "Rough, from your figures" when the figures were typed in', async () => {
    await wrap(<ConfidenceChipV3 confidence={ROUGH} onPress={jest.fn()} />);
    expect(screen.getByText('Rough, from your figures')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(/^Rough, from your figures\. /);
  });
});

describe('ConfidenceSheetV3', () => {
  it('opens from the chip with the title and one sentence per reason, and closes', async () => {
    await wrap(<Harness confidence={ROUGH} />);
    expect(screen.queryByText('How sure this answer is')).toBeNull();
    await fireEvent.press(screen.getByText('Rough, from your figures'));
    expect(screen.getByText('How sure this answer is')).toBeTruthy();
    expect(screen.getByText('It is worked out from figures you typed.')).toBeTruthy();
    expect(screen.getByText('It is based on fewer than 3 months of records.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByText('How sure this answer is')).toBeNull();
  });
});

describe('ConfidenceSheetV3 answers (05.3-59)', () => {
  const rows = waiverRows(
    [
      {
        item: { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null },
        by: 'month_complete',
        waiver: { kind: 'month_complete', month: '2026-09', at: '2026-10-30' },
      },
    ],
    [],
    [{ seriesId: 'gym', name: null }],
    '2026-10',
  );

  it('lists each answer after the reasons, with its effect line and its own Ask again', async () => {
    const log: string[] = [];
    const onClose = jest.fn(() => log.push('close'));
    const onAskAgain = jest.fn(() => log.push('ask'));
    await wrap(<ConfidenceSheetV3 visible confidence={FAIR} onClose={onClose} waivers={rows} format={fakeFormat} onAskAgain={onAskAgain} />);
    expect(screen.getByText('It is based on fewer than 3 months of records.')).toBeTruthy();
    expect(screen.getByText('Your answers this rests on')).toBeTruthy();
    expect(screen.getByText('2026-09: counted as complete')).toBeTruthy();
    expect(screen.getByText('A payment: counted as always paid by someone else')).toBeTruthy();
    expect(screen.getByText('Not counted against your months, including your typical month.')).toBeTruthy();
    expect(screen.getAllByText('Ask again')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Ask again: A payment: counted as always paid by someone else'));
    expect(onAskAgain).toHaveBeenCalledTimes(1);
    expect(onAskAgain).toHaveBeenCalledWith(rows[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['close', 'ask']);
  });

  it('with no answers and no handler, shows only the reasons; Ask again without a handler does nothing', async () => {
    await wrap(<ConfidenceSheetV3 visible confidence={FAIR} onClose={jest.fn()} waivers={[]} />);
    expect(screen.queryByText('Your answers this rests on')).toBeNull();
    await cleanup();
    const onClose = jest.fn();
    await wrap(<ConfidenceSheetV3 visible confidence={FAIR} onClose={onClose} waivers={rows} />);
    expect(screen.getByText('2026-09: counted as complete')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ask again: 2026-09: counted as complete'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
