import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Chip } from '../Chip';

jest.setTimeout(30000);

describe('Chip', () => {
  it('exposes the host Pressable through pressableRef', async () => {
    const ref = React.createRef<React.ComponentRef<typeof import('react-native').View>>();
    await render(
      <ThemeProvider>
        <Chip label="Food" pressableRef={ref} />
      </ThemeProvider>
    );
    expect(ref.current).toBeTruthy();
  });

  it('renders the accent tint only when selected', async () => {
    const a = await render(
      <ThemeProvider>
        <Chip label="Food" />
      </ThemeProvider>
    );
    expect(a.queryByTestId('accent-tint')).toBeNull();
    const b = await render(
      <ThemeProvider>
        <Chip label="Food" selected />
      </ThemeProvider>
    );
    expect(b.getByTestId('accent-tint')).toBeTruthy();
  });
});
