import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WrittenList } from '../WrittenList';

jest.setTimeout(30000);

async function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('WrittenList', () => {
  it('D-76 What gets written renders one wrapping row per line with a dot', async () => {
    const lines = ['A pending expense of $1500.00 on 2026-11-20, in Savings pot.', 'Your saving and investing continue untouched.'];
    const view = await wrap(<WrittenList lines={lines} />);
    for (const line of lines) expect(screen.getByText(line)).toBeTruthy();
    const json = JSON.stringify(view.toJSON());
    expect(json.match(/"borderRadius":3/g)?.length).toBe(2);
    expect(json).toContain('"marginTop":7.125');
    expect(json).not.toContain('numberOfLines');
  });

  it('renders nothing for no lines', async () => {
    const view = await wrap(<WrittenList lines={[]} />);
    expect(JSON.stringify(view.toJSON())).not.toContain('borderRadius');
  });
});
