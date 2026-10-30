/** Plan 05.3-42 (D-18, T-05.3-42-02): the L2, L6 and L7 answers are stored only. Filling every one through the cards leaves the answer
 *  (code, split, facts, day-one cash) exactly as it was, and the stored check carries them only in value and layerAnswers. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readStoredCheck, toStoredV2, type AccountUse, type CheckV2 } from '@/engine/decide/v3';
import { carInputs, demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import { computeV3 } from '@/features/decide/snapshot/v3/computeV3';
import { v3s } from '@/features/decide/snapshot/v3/__tests__/v3Fixtures';
import { withItemType, withPayMode, withPrice } from '../../model/checkEdits';
import { MajorAssetCard } from '../MajorAssetCard';
import { ValueCard } from '../ValueCard';
import { VeryLargeCard } from '../VeryLargeCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

const TODAY = '2026-10-03';
const SOURCE = demoSource(TODAY);
const USES: Record<string, AccountUse> = Object.fromEntries(SOURCE.accounts.map((a) => [a.id, { kind: 'everyday' } as AccountUse]));
const SETTINGS = v3s({ income_types: ['salary'], unspent_anchor: 300000, unspent_anchor_at: '2026-10-01', unexplained_amount: 0, unexplained_use: 'spare', unexplained_at: '2026-10-01' });
const run = (c: CheckV2) => computeV3(demoSource(TODAY), SETTINGS, toStoredV2(c), USES);

describe('D-18: L2, L6 and L7 never move the answer', () => {
  it('computeV3 is identical before and after every stored-only field is filled', async () => {
    const start = withPayMode(withItemType(withPrice(readStoredCheck(carInputs).check, 90000000 as never), { kind: 'preset', value: 'vehicle' }), 'once');
    const before = run(start);
    expect(before.purchase?.layers).toEqual(expect.arrayContaining(['L2', 'L6', 'L7']));

    let latest = start;
    await render(
      <Stateful initial={start} onCheck={(c) => { latest = c; }}>
        {({ check, edit }) => (
          <>
            <ValueCard check={check} edit={edit} currency="USD" />
            <MajorAssetCard check={check} edit={edit} currency="USD" />
            <VeryLargeCard check={check} edit={edit} currency="USD" stagedRequired />
          </>
        )}
      </Stateful>,
    );
    await fireEvent.changeText(screen.getByLabelText('It earns or saves me (a month), optional'), '400');
    await fireEvent.press(screen.getAllByText('10 yrs')[0]!);
    await fireEvent.press(screen.getAllByText('5 yrs')[1]!);
    await fireEvent.press(screen.getByText('A cheaper one'));
    await fireEvent.changeText(screen.getByLabelText('Their price'), '5000');
    await fireEvent.press(screen.getByText('Unspent money'));
    await fireEvent.changeText(screen.getByLabelText('Legal and closing costs'), '1500');
    await fireEvent.changeText(screen.getByLabelText('Moving costs'), '900');
    await fireEvent.changeText(screen.getByLabelText('New bills each month'), '120');
    await fireEvent.changeText(screen.getByLabelText('Bills that stop each month'), '60');
    await fireEvent.press(screen.getByLabelText('+ Add a source'));
    await fireEvent.changeText(screen.getByTestId('source-name-0'), 'Savings');
    await fireEvent.press(screen.getByLabelText('+ Add a payment'));
    await fireEvent.changeText(screen.getByTestId('stage-date-0'), '2027-02-01');
    await fireEvent.press(screen.getByRole('switch', { name: 'I’ve talked this over with a professional' }));

    expect(latest).not.toEqual(start);
    expect(latest.extras).toEqual(start.extras);
    expect(latest.price).toEqual(start.price);

    const after = run(latest);
    expect(after.result.code).toBe(before.result.code);
    expect(after.result.split).toEqual(before.result.split);
    expect(after.result.facts).toEqual(before.result.facts);
    expect(after.purchase?.dayOne).toEqual(before.purchase?.dayOne);
    expect(after.result).toEqual(before.result);
    expect(after.purchase).toEqual(before.purchase);
  });
});
