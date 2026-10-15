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
import { resetPushOnceForTests } from '@/shell/navigation/pushOnce';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const mockProfile: { profile: { full_name: string | null; email: string | null } } = {
  profile: { full_name: 'Paul', email: 'p@x.com' },
};
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => mockProfile }));
const mockLocale = { locale: 'en-GB' };
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => mockLocale }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: jest.fn(() => ({ isOnline: false, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null })),
}));

function Probe() {
  return <RNText>{'probe'}</RNText>;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  resetPushOnceForTests();
  mockProfile.profile = { full_name: 'Paul', email: 'p@x.com' };
  mockLocale.locale = 'en-GB';
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
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('AvatarButton', () => {
  it('shows the initial and pushes /you', async () => {
    await renderWithShellProviders(<AvatarButton />);
    expect(screen.getByText('P')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
    expect(router.push).toHaveBeenCalledWith('/you');
  });

  it('has a 44px target and pushes once on a double tap', async () => {
    await renderWithShellProviders(<AvatarButton />);
    const btn = screen.getByRole('button', { name: 'Profile' });
    expect(btn.props.hitSlop).toBe(1);
    await fireEvent.press(btn);
    await fireEvent.press(btn);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('draws a person glyph when there is no name or email', async () => {
    mockProfile.profile = { full_name: null, email: null };
    await renderWithShellProviders(<AvatarButton />);
    const glyph = screen.getByTestId('avatar-person-glyph', { includeHiddenElements: true });
    expect(glyph.children.length).toBe(2);
  });

  it('keeps a whole emoji initial and upper-cases by locale', async () => {
    mockProfile.profile = { full_name: '🙂 Sam', email: null };
    const first = await renderWithShellProviders(<AvatarButton />);
    expect(screen.getByText('🙂')).toBeTruthy();
    await first.unmount();
    mockProfile.profile = { full_name: 'ilker', email: null };
    mockLocale.locale = 'tr-TR';
    await renderWithShellProviders(<AvatarButton />);
    expect(screen.getByText('İ')).toBeTruthy();
  });
});

describe('TabHeader', () => {
  it('makes eyebrow and title one screen-reader stop', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" eyebrow="WEDNESDAY, 14 OCT" />);
    expect(screen.getByRole('header', { name: 'Overview, WEDNESDAY, 14 OCT' })).toBeTruthy();
    const eyebrow = screen.getByText('WEDNESDAY, 14 OCT', { includeHiddenElements: true });
    expect(eyebrow.props.importantForAccessibility).toBe('no');
    expect(eyebrow.props.accessibilityElementsHidden).toBe(true);
  });

  it('renders title, avatar and no back when history is empty', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" />);
    expect(screen.getByRole('header', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('shows Back when history exists and goes back once', async () => {
    const goBack = jest.fn(() => true);
    await renderWithShellProviders(<TabHeader title="Overview" />, { backHistory: { canGoBack: true, goBack } });
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('renders the eyebrow only when given', async () => {
    await renderWithShellProviders(<TabHeader title="Overview" eyebrow="MONDAY 28 SEPTEMBER" />);
    expect(screen.getByText('MONDAY 28 SEPTEMBER', { includeHiddenElements: true })).toBeTruthy();
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

  it('defaults to the 26px heading title with an avatar', async () => {
    await renderWithShellProviders(<CompactHeader title="Overview" visible />);
    expect(StyleSheet.flatten(screen.getByText('Overview').props.style).fontSize).toBe(26);
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
  });

  it('uses the 16px sheetTitle role on one line when asked', async () => {
    await renderWithShellProviders(<CompactHeader title="Activity" visible titleRole="sheetTitle" />);
    const title = screen.getByText('Activity');
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(16);
    expect(title.props.numberOfLines).toBe(1);
  });

  it('renders a trailing slot without the avatar when showAvatar is false', async () => {
    await renderWithShellProviders(<CompactHeader title="Activity" visible trailing={<Probe />} showAvatar={false} />);
    expect(screen.getByText('probe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Profile' })).toBeNull();
  });

  it('renders trailing after the title and before the avatar', async () => {
    await renderWithShellProviders(<CompactHeader title="Activity" visible trailing={<Probe />} />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Activity')).toBeLessThan(tree.indexOf('probe'));
    expect(tree.indexOf('probe')).toBeLessThan(tree.indexOf('"Profile"'));
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
    await fireEvent.press(back);
    expect(goBack).toHaveBeenCalledTimes(1);
    const title = screen.getByText('Barclays');
    expect(title.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(16);
    expect(screen.getByText('probe')).toBeTruthy();
  });
});
