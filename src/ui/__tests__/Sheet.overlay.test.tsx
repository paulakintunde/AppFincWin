import React from 'react';
import { Text } from 'react-native';
import { render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetSheetStackForTests } from '@/state/sheetStack';
import { Sheet } from '../Sheet';
import { SheetOverlayProvider } from '../sheetOverlay';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

beforeEach(() => resetSheetStackForTests());

function Overlay() {
  return <Text testID="overlay">{'overlay'}</Text>;
}

describe('Sheet overlay slot (D-16)', () => {
  it('renders the injected overlay in the gesture root, outside the container, for the top sheet only', async () => {
    const screen = await render(
      <ThemeProvider>
        <SheetOverlayProvider overlay={Overlay}>
          <Sheet visible onDismiss={jest.fn()}>
            <Text>{'Parent'}</Text>
            <Sheet visible onDismiss={jest.fn()}>
              <Text>{'Child'}</Text>
            </Sheet>
          </Sheet>
        </SheetOverlayProvider>
      </ThemeProvider>,
    );
    const overlays = screen.queryAllByTestId('overlay', { hidden: true });
    expect(overlays).toHaveLength(1);
    const containers = screen.getAllByTestId('sheet-container', { hidden: true });
    for (const c of containers) {
      // The only overlay lives outside every container.
      expect(within(c).queryAllByTestId('overlay', { hidden: true })).toHaveLength(0);
    }
    let node = overlays[0]!.parent;
    let underRoot = false;
    while (node) {
      if (node.props?.testID === 'sheet-gesture-root') underRoot = true;
      node = node.parent;
    }
    expect(underRoot).toBe(true);
  });

  it('renders nothing without a provider', async () => {
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={jest.fn()}>
          <Text>{'Only'}</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(screen.queryAllByTestId('overlay', { hidden: true })).toHaveLength(0);
  });
});
