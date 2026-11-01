/** 05.3-104 (UAT 23, dates): the saved answer line shows the user's local day, not the UTC day. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { SavedAnswerLine } from '../answerParts/ChangeTiles';

jest.setTimeout(60000);

let mockZone = 'America/Vancouver';
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ timeZone: mockZone }) }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({ useV3Format: () => ({ date: (iso: string) => iso }) }));

const stored = { v: 3 as const, code: 'fits_month' as const, variant: null, readyBy: null, unspentAfter: null, lineFacts: [] };
const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

describe('local dates', () => {
  it('7 p.m. Pacific on Oct 31 reads Oct 31', async () => {
    mockZone = 'America/Vancouver';
    await wrap(<SavedAnswerLine stored={stored} decidedAt="2026-11-01T02:30:00Z" />);
    expect(screen.getByText(/, 2026-10-31$/)).toBeTruthy();
  });

  it('a UTC user reads Nov 1', async () => {
    mockZone = 'UTC';
    await wrap(<SavedAnswerLine stored={stored} decidedAt="2026-11-01T02:30:00Z" />);
    expect(screen.getByText(/, 2026-11-01$/)).toBeTruthy();
  });

  it('an unparseable stamp falls back to its first ten characters', async () => {
    await wrap(<SavedAnswerLine stored={stored} decidedAt="2026-13-45 garbage" />);
    expect(screen.getByText(/, 2026-13-45$/)).toBeTruthy();
  });
});
