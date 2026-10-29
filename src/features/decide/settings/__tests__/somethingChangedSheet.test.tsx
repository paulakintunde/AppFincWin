/** Plan 05.2-45: the "What changed?" sheet lists 7 buttons and only reports the pick. */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '../../__tests__/helpers/r18Fit';
import { SomethingChangedSheet } from '../SomethingChangedSheet';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

const LABELS = [
  'My pay changed',
  'New income, or an income stopped',
  'A regular bill started or stopped',
  'I opened or closed an account',
  'I share costs differently now',
  'I used my emergency fund',
  'This month is unusual',
];

async function mount(onPick = jest.fn(), onClose = jest.fn()) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={mockScale}>
          <SomethingChangedSheet visible onClose={onClose} onPick={onPick} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { onPick, onClose };
}

describe('SomethingChangedSheet', () => {
  beforeEach(() => {
    mockScale = 1;
    mockWidth = 402;
  });

  it('shows the title as a header and 7 labelled buttons in order', async () => {
    await mount();
    expect(screen.getByText('What changed?')).toBeTruthy();
    for (const l of LABELS) expect(screen.getByRole('button', { name: l })).toBeTruthy();
  });

  it('pressing a choice closes and reports its id', async () => {
    const { onPick, onClose } = await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'I share costs differently now' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('share');
  });

  for (const m of MATRIX) {
    it(`fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await mount();
      expectFits();
      await cleanup();
    });
  }
});
