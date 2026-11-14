// 06.1-52 (G-5): the shared "still needed" line.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { NeedLine } from '../NeedLine';

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('NeedLine', () => {
  it('draws nothing for null or empty text', async () => {
    const { queryByTestId, rerender } = await wrap(<NeedLine text={null} />);
    expect(queryByTestId('need-line')).toBeNull();
    await rerender(
      <ThemeProvider>
        <NeedLine text="" />
      </ThemeProvider>,
    );
    expect(queryByTestId('need-line')).toBeNull();
  });

  it('draws one polite line with the reason', async () => {
    const { getByTestId } = await wrap(<NeedLine text="A kind is needed to go on." testID="kind-need" />);
    const line = getByTestId('kind-need');
    expect(line.props.accessibilityLiveRegion).toBe('polite');
    expect(line).toHaveTextContent('A kind is needed to go on.');
  });
});
