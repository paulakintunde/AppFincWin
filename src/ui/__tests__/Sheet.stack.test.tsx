import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getSheetStack, resetSheetStackForTests } from '@/state/sheetStack';
import { Sheet } from '../Sheet';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

beforeEach(() => resetSheetStackForTests());

// RNTL 14 has no UNSAFE_getAllByType: collect the host Modals (the ones carrying onRequestClose) in tree order.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function modalsOf(screen: { root: any }): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (el: any, out: any[] = []): any[] => {
    if (el?.props?.onRequestClose) out.push(el);
    for (const c of el?.children ?? []) if (typeof c !== 'string') walk(c, out);
    return out;
  };
  return walk(screen.root);
}

function tree(childVisible: boolean, parentVisible: boolean, onParent = jest.fn(), onChild = jest.fn()) {
  return (
    <ThemeProvider>
      <Sheet visible={parentVisible} onDismiss={onParent}>
        <Text>{'Parent'}</Text>
        <Sheet visible={childVisible} onDismiss={onChild}>
          <Text>{'Child'}</Text>
        </Sheet>
      </Sheet>
    </ThemeProvider>
  );
}

describe('Sheet stacking', () => {
  it('registers parent then child in order', async () => {
    await render(tree(true, true));
    expect(getSheetStack()).toHaveLength(2);
  });

  it('back on the inner Modal closes only the child', async () => {
    const onParent = jest.fn();
    const onChild = jest.fn();
    const screen = await render(tree(true, true, onParent, onChild));
    const modals = modalsOf(screen);
    expect(modals).toHaveLength(2);
    modals[1].props.onRequestClose();
    expect(onChild).toHaveBeenCalledTimes(1);
    expect(onParent).not.toHaveBeenCalled();
  });

  it('hiding the child leaves the parent and unmounting empties the stack', async () => {
    const screen = await render(tree(true, true));
    await screen.rerender(tree(false, true));
    expect(getSheetStack()).toHaveLength(1);
    await screen.unmount();
    expect(getSheetStack()).toHaveLength(0);
  });

  it('removes a sheet when it is hidden', async () => {
    const screen = await render(tree(false, true));
    expect(getSheetStack()).toHaveLength(1);
    await act(async () => screen.rerender(tree(false, false)));
    expect(getSheetStack()).toHaveLength(0);
  });
});
