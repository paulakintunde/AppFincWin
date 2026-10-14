import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { TabHeader } from '../TabHeader';
import { CompactHeader } from '../CompactHeader';
import { DetailHeader } from '../DetailHeader';
import { BackButton } from '../BackButton';
import { AvatarButton } from '../AvatarButton';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/you/useProfile', () => ({
  useProfile: () => ({ profile: { full_name: 'Paul', email: 'p@x.com' } }),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: jest.fn(() => ({ isOnline: false, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null })),
}));

function Probe() {
  return <RNText>{'probe'}</RNText>;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
});

describe('BackButton', () => {
  it.each([
    ['compact', 36],
    ['detail', 38],
  ] as const)('%s is %ipx, labelled Back, with a >= 44 target', async (variant, dim) => {
    const onPress = jest.fn();
    await renderWithShellProviders(<BackButton variant={variant} onPress={onPress} />);
    const btn = screen.getByRole('button', { name: 'Back' });
    const style = StyleSheet.flatten(btn.props.style);
    expect(style).toMatchObject({ width: dim, height: dim });
    expect(dim + btn.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('AvatarButton', () => {
  it('shows the initial and pushes /you', async () => {
    await renderWithShellProviders(<AvatarButton />);
    expect(screen.getByText('P')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
    expect(router.push).toHaveBeenCalledWith('/you');
  });
});

describe('TabHeader', () => {
  it('renders title, avatar and no back when history is empty', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" />);
    expect(screen.getByRole('header', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('shows Back when history exists and goes back once', async () => {
    const goBack = jest.fn(() => true);
    await renderWithShellProviders(<TabHeader title="Overview" />, { backHistory: { canGoBack: true, goBack } });
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('renders the eyebrow only when given', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" eyebrow="MONDAY 28 SEPTEMBER" />);
    expect(screen.getByText('MONDAY 28 SEPTEMBER')).toBeTruthy();
  });

  it('has no eyebrow text without the prop', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" />);
    expect(screen.queryByText(/MONDAY/)).toBeNull();
  });

  it('forwards titleRef', async () => {
    const ref = React.createRef<RNText>();
    await renderWithShellProviders(<TabHeader title="Overview" titleRef={ref} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders trailing before the avatar', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" trailing={<Probe />} />);
    expect(screen.getByText('probe')).toBeTruthy();
  });

  it('pads the top by insets.top + 21', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" />);
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).paddingTop).toBe(47 + 21);
  });
});

describe('CompactHeader', () => {
  it('hides itself from touch and screen readers when invisible', async () => {
    await renderWithShellProviders(<CompactHeader title="Overview" visible={false} />);
    const title = screen.getByText('Overview', { includeHiddenElements: true });
    expect(title.props.numberOfLines).toBe(1);
    const root = screen.getByTestId('compact-header', { includeHiddenElements: true });
    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('is interactive when visible, with back and avatar', async () => {
    await renderWithShellProviders(<CompactHeader title="Overview" visible />, { backHistory: { canGoBack: true } });
    const root = screen.getByTestId('compact-header');
    expect(root.props.accessibilityElementsHidden).toBe(false);
    expect(root.props.importantForAccessibility).toBe('auto');
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
  });

  it('shows the sync problem line under the row', async () => {
    await renderWithShellProviders(<CompactHeader title="Overview" visible />);
    expect(screen.getByText('offline')).toBeTruthy();
  });
});

describe('DetailHeader', () => {
  it('renders a 38px back, a one-line 16px title and the right slot', async () => {
    const goBack = jest.fn(() => true);
    await renderWithShellProviders(<DetailHeader title="Barclays" right={<Probe />} />, { backHistory: { goBack } });
    const back = screen.getByRole('button', { name: 'Back' });
    expect(StyleSheet.flatten(back.props.style)).toMatchObject({ width: 38, height: 38 });
    fireEvent.press(back);
    expect(goBack).toHaveBeenCalledTimes(1);
    const title = screen.getByText('Barclays');
    expect(title.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(16);
    expect(screen.getByText('probe')).toBeTruthy();
  });
});
