import React from 'react';
import { Text as RNText } from 'react-native';
import { screen } from '@testing-library/react-native';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { useScreenTitleFocus } from '@/shell/a11yFocus';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { DetailScreen } from '../DetailScreen';

jest.mock('expo-router', () => ({
  useScrollToTop: jest.fn(),
  useFocusEffect: jest.fn(),
  router: { push: jest.fn() },
}));
jest.mock('@/shell/a11yFocus', () => ({
  useScreenTitleFocus: jest.fn(),
  focusAccessibility: jest.fn(),
}));
jest.mock('@/features/you/useProfile', () => ({
  useProfile: () => ({ profile: { full_name: 'Paul', email: 'p@x.com' } }),
}));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: jest.fn(),
}));

const isScroll = (n: any) => n.type === 'RCTScrollView';
function insideScroll(node: any): boolean {
  let n = node;
  while (n) {
    if (isScroll(n)) return true;
    n = n.parent;
  }
  return false;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  (useSyncStatus as jest.Mock).mockReturnValue({
    isOnline: true,
    queued: 0,
    failed: 0,
    conflicts: 0,
    lastSyncedAt: null,
  });
});

describe('DetailScreen', () => {
  it('renders the title, a Back button and children in a scroll view', async () => {
    await renderWithShellProviders(
      <DetailScreen title="Barclays">
        <RNText testID="child">{'body'}</RNText>
      </DetailScreen>,
    );
    expect(screen.getByRole('header', { name: 'Barclays' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(insideScroll(screen.getByTestId('child'))).toBe(true);
    expect(useScreenTitleFocus).toHaveBeenCalled();
  });

  it('renders children without a scroll view when scroll is false', async () => {
    await renderWithShellProviders(
      <DetailScreen title="Barclays" scroll={false}>
        <RNText testID="child">{'body'}</RNText>
      </DetailScreen>,
    );
    expect(insideScroll(screen.getByTestId('child'))).toBe(false);
  });

  it('shows the sync line when there is a problem', async () => {
    (useSyncStatus as jest.Mock).mockReturnValue({
      isOnline: false,
      queued: 2,
      failed: 0,
      conflicts: 0,
      lastSyncedAt: null,
    });
    await renderWithShellProviders(<DetailScreen title="Barclays" />);
    expect(screen.getByRole('header', { name: 'Barclays' })).toBeTruthy();
  });
});

type ScrollJson = { type: string; props: Record<string, unknown>; children?: unknown[] | null };
function findScroll(node: unknown): ScrollJson | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findScroll(n);
      if (hit) return hit;
    }
    return null;
  }
  const j = node as ScrollJson;
  if (j.type === 'RCTScrollView') return j;
  return findScroll(j.children ?? null);
}

describe('DetailScreen keyboardShouldPersistTaps (06.1-62, CB-2)', () => {
  it('passes the opt-in prop to the scroll view', async () => {
    const r = await renderWithShellProviders(<DetailScreen title="Quick" keyboardShouldPersistTaps="handled" />);
    expect(findScroll(r.toJSON())?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('leaves the default unchanged when the prop is absent', async () => {
    const r = await renderWithShellProviders(<DetailScreen title="Quick" />);
    const scroll = findScroll(r.toJSON());
    expect(scroll).not.toBeNull();
    expect(scroll?.props.keyboardShouldPersistTaps).toBeUndefined();
  });

  it('has no scroll view to pass it to when scroll is false', async () => {
    const r = await renderWithShellProviders(<DetailScreen title="Quick" scroll={false} keyboardShouldPersistTaps="handled" />);
    expect(findScroll(r.toJSON())).toBeNull();
  });
});

