import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { SOLE_SHARE } from '@/engine/decide';
import { ScopeToggle } from '../ScopeToggle';
import { SplitOverrideSheet } from '../SplitOverrideSheet';
import { WhoPaysSection } from '../sections/WhoPaysSection';
import type { SectionProps } from '../sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import type { CheckInputs } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const NAMES = ['Ana', 'Ben'];
const TWO = { weights: [1, 1], myIndex: 0 };

function scope(over: Partial<CheckInputs> = {}, extra: Partial<React.ComponentProps<typeof ScopeToggle>> = {}) {
  return {
    memberCount: 2,
    householdName: 'Our home',
    inputs: buy(over),
    update: jest.fn(),
    sharePct: '50%',
    currency: 'USD',
    memberNames: NAMES,
    ...extra,
  };
}
function who(over: Partial<CheckInputs>, extra: Partial<React.ComponentProps<typeof WhoPaysSection>> = {}) {
  const p = stepProps(buy(over));
  const base: SectionProps = {
    computation: p.computation,
    inputs: p.inputs,
    update: jest.fn(),
    whole,
    exact,
    currency: 'USD',
    expanded: true,
    onToggle: jest.fn(),
    readOnly: false,
  };
  return { ...base, memberCount: 2, memberNames: NAMES, share: TWO, dayOneTotal: 100_001, monthlyTotal: 5_001, ...extra };
}

describe('household scope UI: hidden for every Phase 5 household', () => {
  it('renders nothing for one member (the Phase 5 state) in all three pieces', async () => {
    const t = scope({ scope: 'household' }, { memberCount: 1 });
    await wrap(<ScopeToggle {...t} />);
    expect(screen.queryByText('Just me')).toBeNull();
    expect(screen.queryByText('Our home')).toBeNull();
    expect(screen.queryByText('Split for this purchase')).toBeNull();

    await wrap(<WhoPaysSection {...who({ scope: 'household' }, { memberCount: 1, share: SOLE_SHARE })} />);
    expect(screen.queryByText('Who pays what')).toBeNull();

    await wrap(<SplitOverrideSheet visible={false} split={null} memberNames={['Ana']} currency="USD" onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByText('Even')).toBeNull();
  });

  it('WhoPaysSection is omitted in personal scope even with several members', async () => {
    await wrap(<WhoPaysSection {...who({ scope: 'personal' })} />);
    expect(screen.queryByText('Who pays what')).toBeNull();
  });
});

describe('ScopeToggle with two members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows Just me and the household, switches scope and shows the share line', async () => {
    const p = scope();
    await wrap(<ScopeToggle {...p} />);
    expect(screen.getByText('Just me')).toBeTruthy();
    expect(screen.queryByText('Split for this purchase')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Our home' }));
    expect(p.update).toHaveBeenCalledWith({ scope: 'household' });

    const h = scope({ scope: 'household' });
    await wrap(<ScopeToggle {...h} />);
    expect(screen.getByText('Split evenly across 2 people — your share is 50%.')).toBeTruthy();
  });

  it('opens the split sheet, saves a weighted split and cancels without writing', async () => {
    const p = scope({ scope: 'household' });
    await wrap(<ScopeToggle {...p} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Split for this purchase' }));
    for (const label of ['Even', 'By weight', 'Set amounts', 'All mine']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('radio', { name: 'By weight' }));
    await fireEvent.changeText(screen.getByLabelText('By weight, Ben'), '3');
    await fireEvent.press(screen.getByText('Save split'));
    expect(p.update).toHaveBeenCalledWith({ split: { kind: 'weight', weights: [1, 3], amounts: [] } });

    const c = scope({ scope: 'household' });
    await wrap(<ScopeToggle {...c} />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Split for this purchase' })[0]!);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    expect(c.update).not.toHaveBeenCalled();
  });

  it('All mine saves a mine split', async () => {
    const p = scope({ scope: 'household' });
    await wrap(<ScopeToggle {...p} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Split for this purchase' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'All mine' }));
    await fireEvent.press(screen.getByText('Save split'));
    expect(p.update).toHaveBeenCalledWith({ split: { kind: 'mine', weights: [], amounts: [] } });
  });
});

describe('WhoPaysSection with two members in household scope', () => {
  it('lists each member part from memberParts, remainders kept', async () => {
    await wrap(<WhoPaysSection {...who({ scope: 'household' })} />);
    expect(screen.getByText('Who pays what')).toBeTruthy();
    expect(screen.getByText('2 people')).toBeTruthy();
    // 100001 splits 50001 / 50000 (largest remainder), 5001 splits 2501 / 2500; the parts add back to the totals
    expect(screen.getByLabelText('Ana, On the day $500, A month $25.01')).toBeTruthy();
    expect(screen.getByLabelText('Ben, On the day $500, A month $25.00')).toBeTruthy();
  });
});
