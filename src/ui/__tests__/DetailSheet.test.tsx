import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DetailSheet, DetailRow } from '../DetailSheet';
import { ConfirmSheet } from '../ConfirmSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

jest.setTimeout(20000);

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('DetailSheet', () => {
  it('renders header slots, rows and actions', async () => {
    const { getByText } = await wrap(
      <DetailSheet
        visible
        onDismiss={jest.fn()}
        accessibilityLabel="Details"
        leading={<Text>LEAD</Text>}
        title="Coffee"
        subtitle="Today"
        trailing={<Text>TRAIL</Text>}
        actions={<Text>ACT</Text>}
      >
        <DetailRow label="Account" value="Main" emptyText="None" />
        <DetailRow label="Note" value={null} emptyText="—" />
      </DetailSheet>,
    );
    for (const s of ['LEAD', 'Coffee', 'Today', 'TRAIL', 'ACT', 'Account', 'Main', 'Note', '—']) {
      expect(getByText(s)).toBeTruthy();
    }
  });

  it('renders nothing when not visible', async () => {
    const { queryByText } = await wrap(
      <DetailSheet visible={false} onDismiss={jest.fn()} accessibilityLabel="Details" title="Coffee" />,
    );
    expect(queryByText('Coffee')).toBeNull();
  });

  it('dismiss calls onDismiss', async () => {
    const onDismiss = jest.fn();
    const { getAllByRole } = await wrap(
      <DetailSheet visible onDismiss={onDismiss} accessibilityLabel="Details" title="Coffee" />,
    );
    await fireEvent.press(getAllByRole('button')[0]!);
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('ConfirmSheet title', () => {
  const base = { visible: true, body: 'Body text', cancelLabel: 'No', confirmLabel: 'Yes', onConfirm: jest.fn(), onCancel: jest.fn() };
  it('renders the title when given', async () => {
    const { getByText } = await wrap(<ConfirmSheet {...base} title="Sure?" />);
    expect(getByText('Sure?')).toBeTruthy();
    expect(getByText('Body text')).toBeTruthy();
  });
  it('omits the title otherwise', async () => {
    const { queryByText } = await wrap(<ConfirmSheet {...base} />);
    expect(queryByText('Sure?')).toBeNull();
  });
});
