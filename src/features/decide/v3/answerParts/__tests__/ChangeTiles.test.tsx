/** Plan 05.3-26: change tiles and the saved-answer meta line. */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { ChangedSinceOpenedTile, ChangedSinceSavedTile, SavedAnswerLine } from '../ChangeTiles';

jest.setTimeout(60000);

jest.mock('@/features/decide/v3/shared/useV3Format', () => ({
  useV3Format: () => ({ date: () => '12 Oct' }),
}));

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ timeZone: 'America/Vancouver' }) }));

const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

const tile = { show: true, fromKey: 'decide.v3.verdict.fitsUnspent.chip', toKey: 'decide.v3.verdict.notYetNotCovered.chip' };

describe('change tiles', () => {
  it('announces the open-time change once per from/to pair', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const r = await wrap(<ChangedSinceOpenedTile tile={tile} />);
    expect(screen.getByText('This answer changed since you opened it: Fits from unspent money to Not yet.')).toBeTruthy();
    expect(screen.getByText(/changed since you opened it/).parent?.props.accessibilityLiveRegion).toBe('polite');
    await r.rerender(
      <FontScaleProvider>
        <ThemeProvider>
          <ChangedSinceOpenedTile tile={{ ...tile }} />
        </ThemeProvider>
      </FontScaleProvider>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('renders nothing when the answer did not move', async () => {
    await wrap(<ChangedSinceOpenedTile tile={{ ...tile, show: false }} />);
    expect(screen.queryByText(/changed since/)).toBeNull();
  });

  it('shows the saved-plan change wording', async () => {
    await wrap(<ChangedSinceSavedTile tile={tile} />);
    expect(screen.getByText('Changed since you saved: Fits from unspent money to Not yet.')).toBeTruthy();
  });

  it('renders the saved and last-saved meta lines', async () => {
    const stored = { v: 3 as const, code: 'not_yet' as const, variant: null, readyBy: null, unspentAfter: null, lineFacts: [] };
    const r = await wrap(<SavedAnswerLine stored={stored} decidedAt="2026-10-12T09:00:00Z" />);
    expect(screen.getByText('Saved answer: Not yet, 12 Oct')).toBeTruthy();
    await r.rerender(
      <FontScaleProvider>
        <ThemeProvider>
          <SavedAnswerLine stored={stored} decidedAt="2026-10-12T09:00:00Z" variant="last" />
        </ThemeProvider>
      </FontScaleProvider>,
    );
    expect(screen.getByText('Last saved answer: Not yet, 12 Oct')).toBeTruthy();
  });
});
