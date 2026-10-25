import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { FoldRow } from '../FoldRow';

jest.setTimeout(30000);

async function wrap(preview: string) {
  return await render(
    <ThemeProvider>
      <FontScaleProvider value={1}>
        <FoldRow title="Done · 2" preview={preview} expanded={false} onToggle={() => undefined} />
      </FontScaleProvider>
    </ThemeProvider>,
  );
}

describe('FoldRow spoken label', () => {
  it('D-101 an empty preview leaves the label as the title, with no dangling separator', async () => {
    await wrap('');
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Done · 2');
  });

  it('D-101 a preview is still spoken after the title', async () => {
    await wrap('Nothing breaks');
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Done · 2, Nothing breaks');
  });
});
