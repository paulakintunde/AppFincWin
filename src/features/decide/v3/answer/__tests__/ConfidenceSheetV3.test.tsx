/** Plan 05.3-25: ConfidenceChipV3 and ConfidenceSheetV3. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Confidence } from '@/engine/decide/v3';
import { ConfidenceChipV3 } from '../ConfidenceChipV3';
import { ConfidenceSheetV3 } from '../ConfidenceSheetV3';
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
