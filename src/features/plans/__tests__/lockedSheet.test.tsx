import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LockedSheet } from '../LockedSheet';
import { NoticeCard } from '../components/NoticeCard';

jest.setTimeout(30000);

jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));

describe('LockedSheet', () => {
  beforeEach(() => mockPush.mockClear());

  it('locked: names the action, Choose a plan goes to Plans in locked mode, Keep reading closes', async () => {
    const onClose = jest.fn();
    const { getByText } = await render(
      <ThemeProvider>
        <LockedSheet visible action="addTransaction" variant="locked" onClose={onClose} />
      </ThemeProvider>,
    );
    expect(getByText('Adding a transaction needs a plan')).toBeTruthy();
    await fireEvent.press(getByText('Keep reading'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByText('Choose a plan'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/plans', params: { mode: 'locked', trigger: 'locked' } });
  });

  it('sample: says it needs your own records and leads to the trial', async () => {
    const { getByText } = await render(
      <ThemeProvider>
        <LockedSheet visible action="newDecideCheck" variant="sample" onClose={jest.fn()} />
      </ThemeProvider>,
    );
    expect(getByText('That needs your own records')).toBeTruthy();
    expect(getByText('Keep looking')).toBeTruthy();
    await fireEvent.press(getByText('Start 14-day free trial'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/plans', params: { mode: 'first_run', trigger: 'sample_bar' } });
  });
});

describe('NoticeCard', () => {
  it('renders title, body, badge and at most two actions', async () => {
    const a = jest.fn();
    const { getByText, queryByText, getByTestId } = await render(
      <ThemeProvider>
        <NoticeCard
          title="Title"
          body="One sentence."
          badge="readOnly"
          testID="n"
          actions={[
            { label: 'One', onPress: a, kind: 'primary' },
            { label: 'Two', onPress: jest.fn(), kind: 'link' },
            { label: 'Three', onPress: jest.fn(), kind: 'link' },
          ]}
        />
      </ThemeProvider>,
    );
    expect(getByTestId('n')).toBeTruthy();
    expect(getByText('Title')).toBeTruthy();
    expect(getByText('One sentence.')).toBeTruthy();
    expect(getByText('Read-only')).toBeTruthy();
    expect(queryByText('Three')).toBeNull();
    await fireEvent.press(getByText('One'));
    expect(a).toHaveBeenCalled();
  });
});
