// 06.1-35 (CO-D-64 (3), N03, D65, CO-D-57): the four information sheets, on engine-run fixtures.
import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { monthPicture, prepare, type MonthPicture } from '@/engine/decide/v3';
import { inputsOf } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { wrap } from '@/test/stepProps';
import { AboutSheet } from '../AboutSheet';
import { FreeHelpSheet, openHelpUrl } from '../FreeHelpSheet';
import { GiveMoreSheet } from '../GiveMoreSheet';
import { HowWorkedOutSheet } from '../HowWorkedOutSheet';
import { ledgerRun } from '../../__tests__/fixtures';

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const noop = (): void => undefined;
const said = { currency: 'USD', today: '2026-11-05' };

// A closed Sheet finishes its exit on a timer; let it settle so the next test starts clean.
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('AboutSheet', () => {
  it('lists every caveat of the result', async () => {
    const result = ledgerRun('N04').evaluation.result;
    const all = result.caveats ?? [];
    expect(all.length).toBeGreaterThan(1);
    await wrap(<AboutSheet result={result} country="GB" said={said} onClose={noop} />);
    expect(screen.getAllByTestId('about-caveat')).toHaveLength(all.length);
  });

  it('shows money help for GB', async () => {
    await wrap(<AboutSheet country="GB" said={said} onClose={noop} />);
    expect(screen.getByTestId('about-free-help')).toBeTruthy();
  });

  it('hides money help for a country without a row', async () => {
    await wrap(<AboutSheet country="ZZ" said={said} onClose={noop} />);
    expect(screen.getByText('About this answer')).toBeTruthy();
    expect(screen.queryByTestId('about-free-help')).toBeNull();
  });
});

describe('GiveMoreSheet', () => {
  const line = (code: string, text: string) => ({ key: `k.${code}`, code, text });
  it('has no sure or surer, links each missing figure and offers a reminder only when given a date', async () => {
    const opened: string[] = [];
    await wrap(
      <GiveMoreSheet
        nextStep={line('add_records', 'More months of records give this more to go on.')}
        readiness={[line('past_month_missing', 'A past month is missing.')]}
        missing={[line('no_income_figures', 'No regular income is set up yet.')]}
        remindOn="2026-12-01"
        onRemind={noop}
        onOpenMissing={(c) => opened.push(c)}
        onClose={noop}
      />
    );
    expect(screen.queryByText(/\bsurer?\b/i)).toBeNull();
    fireEvent.press(screen.getByTestId('give-more-missing'));
    expect(opened).toEqual(['no_income_figures']);
    expect(screen.getByTestId('give-more-remind')).toBeTruthy();
  });

  it('shows no reminder without a date', async () => {
    await wrap(<GiveMoreSheet nextStep={line('add_records', 'x')} readiness={[]} missing={[]} onOpenMissing={noop} onClose={noop} />);
    expect(screen.queryByTestId('give-more-remind')).toBeNull();
  });
});

describe('FreeHelpSheet', () => {
  it('lists the country service and opens only https links', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await wrap(<FreeHelpSheet country="US" onClose={noop} />);
    expect(screen.getByText('Independent services. Not a loan, and not part of FincWin.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('free-help-row'));
    expect(open).toHaveBeenCalledWith('https://www.nfcc.org');
    open.mockClear();
    expect(openHelpUrl('http://example.com')).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('HowWorkedOutSheet', () => {
  const sources = { activityFrom: '2026-08-01', activityTo: '2026-10-31', netSize: 150000, netLocked: false, rulesCount: 2 };
  it('shows the picture figures and the overdraft on its own line', async () => {
    const picture = ({ ...monthPicture(prepare(inputsOf({ asOf: '2026-11-05' }))), balanceOn: 123456, afterBillsBeforePayday: 100000, monthEnd: 98765, unusedOverdraft: 40000 }) as unknown as MonthPicture;
    await wrap(<HowWorkedOutSheet picture={picture} currency="USD" sources={sources} onClose={noop} />);
    expect(screen.getByText('$987.65')).toBeTruthy();
    expect(screen.getByText('Unused overdraft')).toBeTruthy();
    expect(screen.getByText('$400.00')).toBeTruthy();
    expect(screen.getByText('Expected at month end')).toBeTruthy();
    expect(screen.getByText('Your money rules')).toBeTruthy();
  });

  it('hides the overdraft line when none is unused', async () => {
    const picture = ({ ...monthPicture(prepare(inputsOf({ asOf: '2026-11-05' }))), unusedOverdraft: 0 }) as unknown as MonthPicture;
    await wrap(<HowWorkedOutSheet picture={picture} currency="USD" sources={sources} onClose={noop} />);
    expect(screen.queryByText('Unused overdraft')).toBeNull();
  });
});
