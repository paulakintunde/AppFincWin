// 06.2-15 (D-21, D-28, L04): the Haptics switch row and the You row icon map.
import * as Haptics from 'expo-haptics';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getHapticsEnabled, setHapticsEnabled } from '@/ui/hapticsSetting';
import { ICONS } from '@/ui/icons/iconData';
import { HapticsRow } from '../components/HapticsRow';
import { YOU_ROW_ICON, type YouRowId } from '../components/youRowIcons';

const selection = Haptics.selectionAsync as jest.Mock;

async function renderRow() {
  const utils = render(
    <ThemeProvider>
      <HapticsRow />
    </ThemeProvider>
  );
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  setHapticsEnabled(true);
});

afterAll(() => {
  setHapticsEnabled(true);
});

describe('HapticsRow (D-21, D-28)', () => {
  it('shows the word, the hint and a switch that is on by default', async () => {
    const { getByText, getByRole } = await renderRow();
    expect(getByText('Haptics')).toBeTruthy();
    expect(getByText('A small tap when you save, a goal is reached, or a cap is crossed')).toBeTruthy();
    const sw = getByRole('switch', { name: 'Haptics' });
    expect(sw.props.accessibilityState?.checked).toBe(true);
  });

  it('shows the haptics icon tile', async () => {
    const { getByTestId } = await renderRow();
    expect(getByTestId('you-tile-haptics')).toBeTruthy();
  });

  it('turning it off silences haptics and gives no tick', async () => {
    const { getByRole } = await renderRow();
    await act(async () => {
      fireEvent.press(getByRole('switch', { name: 'Haptics' }));
    });
    expect(getHapticsEnabled()).toBe(false);
    expect(selection).not.toHaveBeenCalled();
    expect(getByRole('switch', { name: 'Haptics' }).props.accessibilityState?.checked).toBe(false);
  });

  it('turning it on stores ON, then gives one tick', async () => {
    setHapticsEnabled(false);
    const { getByRole } = await renderRow();
    expect(getByRole('switch', { name: 'Haptics' }).props.accessibilityState?.checked).toBe(false);
    await act(async () => {
      fireEvent.press(getByRole('switch', { name: 'Haptics' }));
    });
    expect(getHapticsEnabled()).toBe(true);
    expect(selection).toHaveBeenCalledTimes(1);
  });
});

describe('YOU_ROW_ICON (D-06)', () => {
  it('maps every You row to a drawn icon', () => {
    const ids = Object.keys(YOU_ROW_ICON) as YouRowId[];
    expect(ids.length).toBeGreaterThanOrEqual(19);
    for (const id of ids) expect(ICONS[YOU_ROW_ICON[id]]).toBeDefined();
  });

  it('uses the chosen icons', () => {
    expect(YOU_ROW_ICON.haptics).toBe('haptics');
    expect(YOU_ROW_ICON.signOut).toBe('signOut');
    expect(YOU_ROW_ICON.accent).toBe('accent');
    expect(YOU_ROW_ICON.font).toBe('font');
    expect(YOU_ROW_ICON.analytics).toBe('privacy');
    expect(YOU_ROW_ICON.connection).toBe('connected');
    expect(YOU_ROW_ICON.weekStart).toBe('calendar');
    expect(YOU_ROW_ICON.goals).toBe('savings');
  });
});
