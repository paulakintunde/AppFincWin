import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render } from '@testing-library/react-native';
import { AppStatusBar } from '@/ui/AppStatusBar';

// Capture the props expo-status-bar receives rather than depend on its native wrapper.
const statusBarProps: Record<string, unknown>[] = [];
jest.mock('expo-status-bar', () => ({
  StatusBar: (props: Record<string, unknown>) => {
    statusBarProps.push(props);
    return null;
  },
}));

describe('AppStatusBar (DSG-03 on-device: status-bar icons legible on the light canvas)', () => {
  beforeEach(() => {
    statusBarProps.length = 0;
  });

  it('renders expo-status-bar with dark content for the light canvas theme', async () => {
    await render(<AppStatusBar />);
    expect(statusBarProps.at(-1)).toMatchObject({ style: 'dark' });
  });

  it('is mounted by the root layout so every route gets it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'app', '_layout.tsx'), 'utf8');
    expect(src).toMatch(/import \{ AppStatusBar \} from '@\/ui\/AppStatusBar'/);
    expect(src).toMatch(/<AppStatusBar \/>/);
  });
});
