import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { MemberSheet } from '../MemberSheet';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const mockDisplay = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; reason?: string; version?: number; updated_by?: string | null }> => ({ ok: true, version: 2 }));
const mockRole = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; reason?: string }> => ({ ok: true }));
jest.mock('@/db/householdMembers', () => ({
  setMyMemberDisplay: (...a: unknown[]) => mockDisplay(...a),
  setMemberRole: (...a: unknown[]) => mockRole(...a),
  setMemberWeights: jest.fn(async () => ({ ok: true })),
}));

let mockMembers: Record<string, unknown>[] = [];
jest.mock('@/data/queries/household', () => ({ useHouseholdMembers: () => ({ data: mockMembers }), useFormerMembers: () => ({ data: [] }) }));

function member(id: string, name: string, colour: number, extra: Record<string, unknown> = {}) {
  return {
    household_id: 'h', user_id: id, is_owner: false, role_label: 'Flatmate', weight: 50, colour_key: colour,
    display_name: name, name_hidden: false, version: 1, ...extra,
  };
}

async function setup(userId = 'me') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemberSheet visible householdId="h" userId={userId} onClose={jest.fn()} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockDisplay.mockClear();
  mockRole.mockClear();
  mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 1, { is_owner: true, role_label: 'Owner' })];
});

describe('MemberSheet', () => {
  it('previews the colour name when the name is hidden', async () => {
    await setup();
    expect(screen.getByTestId('name-preview').props.children).toBe('Others see: Paul');
    await fireEvent.press(screen.getByLabelText('My colour'));
    expect(screen.getByTestId('name-preview').props.children).toBe('Others see: Green');
  });

  it('marks a taken colour disabled with who holds it', async () => {
    await setup();
    const rust = screen.getByTestId('colour-rust');
    expect(rust.props.accessibilityLabel).toBe('Rust, taken by Sam');
    expect(rust.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('colour-teal').props.accessibilityState.disabled).toBe(false);
  });

  it('caps a custom role at 24 characters and will not save a longer one', async () => {
    await setup();
    const field = screen.getByLabelText('Other');
    await fireEvent.press(field);
    const input = screen.getByTestId('role-other-input');
    expect(input.props.maxLength).toBe(24);
    await fireEvent.changeText(input, 'x'.repeat(25));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(mockRole).not.toHaveBeenCalled();
    await fireEvent.changeText(input, 'Cousin');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(mockRole).toHaveBeenCalledWith(expect.anything(), 'me', 'Cousin', 1));
  });

  it('saves colour and name display with the expected version', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('colour-teal'));
    await fireEvent.press(screen.getByLabelText('My colour'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() =>
      expect(mockDisplay).toHaveBeenCalledWith(expect.anything(), { expectedVersion: 1, colourKey: 5, nameHidden: true, displayName: null }),
    );
  });

  it('offers 12 colours and saves a colour above 5', async () => {
    await setup();
    for (const ck of ['green', 'rust', 'slate', 'ochre', 'plum', 'teal', 'navy', 'magenta', 'brown', 'orange', 'charcoal', 'brick']) {
      expect(screen.getByTestId(`colour-${ck}`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('colour-charcoal'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() =>
      expect(mockDisplay).toHaveBeenCalledWith(expect.anything(), { expectedVersion: 1, colourKey: 10, nameHidden: false, displayName: null }),
    );
    mockDisplay.mockClear();
    await fireEvent.press(screen.getByTestId('colour-orange'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() =>
      expect(mockDisplay).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ colourKey: 9 })),
    );
  });

  it('marks a new colour held by another member as taken', async () => {
    mockMembers = [member('me', 'Paul', 0), member('u2', 'Sam', 7, { is_owner: true, role_label: 'Owner' })];
    await setup();
    const magenta = screen.getByTestId('colour-magenta');
    expect(magenta.props.accessibilityLabel).toBe('Magenta, taken by Sam');
    expect(magenta.props.accessibilityState.disabled).toBe(true);
  });

  it('shows the conflict card on version_conflict', async () => {
    mockDisplay.mockResolvedValueOnce({ ok: false, reason: 'version_conflict' });
    await setup();
    await fireEvent.press(screen.getByTestId('colour-teal'));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('Changed by someone else')).toBeTruthy();
  });

  it('names who saved first on version_conflict', async () => {
    mockDisplay.mockResolvedValueOnce({ ok: false, reason: 'version_conflict', updated_by: 'u2' });
    await setup();
    await fireEvent.press(screen.getByTestId('colour-teal'));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('Sam changed this first')).toBeTruthy();
  });

  it('offers Leave on your own row and Remove only to the owner on someone else', async () => {
    await setup();
    expect(screen.getByTestId('member-leave')).toBeTruthy();
    expect(screen.queryByTestId('member-remove')).toBeNull();
  });

  it('owner sees Remove on another member and cannot edit their colour', async () => {
    mockMembers = [member('me', 'Paul', 0, { is_owner: true, role_label: 'Owner' }), member('u2', 'Sam', 1)];
    await setup('u2');
    expect(screen.getByTestId('member-remove')).toBeTruthy();
    expect(screen.queryByTestId('colour-teal')).toBeNull();
    expect(screen.getByLabelText('Partner')).toBeTruthy();
  });
});
