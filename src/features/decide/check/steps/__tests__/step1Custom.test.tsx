import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { ITEM_TYPES } from '@/engine/decide';
import { ITEM_CHIP_ORDER, Step1Item } from '../Step1Item';
import { AssumptionsBody } from '../../sections/AssumptionsSection';
import { META, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs } from '../../../snapshot/types';
import { buy, exact, stepProps, whole, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));

type Update = (patch: Partial<CheckInputs>) => void;

/** Holds the inputs so an edit re-renders, as the flow shell does. */
function Harness({ initial, onUpdate, readOnly = false }: { initial: CheckInputs; onUpdate?: Update; readOnly?: boolean }) {
  const [inputs, setInputs] = useState(initial);
  const update: Update = (patch) => {
    onUpdate?.(patch);
    setInputs((cur) => ({ ...cur, ...patch }));
  };
  const p = stepProps(inputs, { update, readOnly });
  return <Step1Item {...p} recurringBills={[]} />;
}

const last = (fn: jest.Mock) => fn.mock.calls.at(-1)?.[0] as Partial<CheckInputs>;

describe('Step 1 custom item type (05-86)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-81 a custom item type follows General rules unless Treat like is set', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy({ itemType: 'vehicle', itemTypeTouched: true })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom…'));
    await fireEvent.changeText(screen.getByPlaceholderText('Drone'), 'Drone');
    expect(last(onUpdate).itemType).toBe('general');
    expect(last(onUpdate).customItemType).toEqual({ name: 'Drone', treatLike: null });
  });

  it('D-81 Treat like Vehicle sets the secured default and keeps the name', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy({ method: 'loan' })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom…'));
    await fireEvent.changeText(screen.getByPlaceholderText('Drone'), '  Drone ');
    await fireEvent.press(screen.getByLabelText('Treat like, General (default)'));
    await fireEvent.press(screen.getAllByLabelText('Vehicle').at(-1)!);
    const patch = last(onUpdate);
    expect(patch.itemType).toBe('vehicle');
    expect(patch.loan?.secured).toBe(true);
    expect(patch.customItemType).toEqual({ name: 'Drone', treatLike: 'vehicle' });
  });

  it('D-81 an empty custom name is not applied', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy()} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom…'));
    await fireEvent.changeText(screen.getByPlaceholderText('Drone'), '   ');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('1 to 40 characters')).toBeTruthy();
  });

  it('D-81 the custom chip reads the name with its a11y label', async () => {
    await wrap(<Harness initial={buy({ customItemType: { name: 'Drone', treatLike: null } })} />);
    const chip = screen.getByLabelText('Custom item type, Drone');
    expect(chip.props.accessibilityState.selected).toBe(true);
    const text = screen.getByText('Drone', { exact: true, includeHiddenElements: true });
    expect(text.props.numberOfLines).toBe(2);
    expect(text.props.ellipsizeMode).toBe('tail');
  });

  it('D-81 the name suggestion still selects a built-in chip', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy({ name: '', method: 'loan' })} onUpdate={onUpdate} />);
    await fireEvent.changeText(screen.getByLabelText('What it is'), 'car');
    expect(last(onUpdate).itemType).toBe('vehicle');
    expect(screen.getByLabelText('Vehicle').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Suggested from the name')).toBeTruthy();
  });

  it('D-81 picking a built-in chip clears the custom name', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy({ customItemType: { name: 'Drone', treatLike: null } })} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Tax'));
    expect(last(onUpdate).customItemType).toBeNull();
    expect(last(onUpdate).itemType).toBe('tax');
  });

  it('D-81 Assumptions shows the custom name and treated like', async () => {
    const inputs = buy({ itemType: 'vehicle', customItemType: { name: 'Drone', treatLike: 'vehicle' } });
    const p = stepProps(inputs, {}, loggedSource());
    await wrap(
      <AssumptionsBody computation={p.computation} inputs={inputs} update={jest.fn()} whole={whole} exact={exact} currency="USD" readOnly={false} meta={META} />,
    );
    const name = screen.getByText('Drone');
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
    expect(screen.getByText('treated like Vehicle')).toBeTruthy();
    expect(screen.getByLabelText('Item type, Drone, treated like Vehicle')).toBeTruthy();
  });
});

describe('Step 1 new item types (05-104, D-92)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-92 step 1 offers Property, Tuition and Cash-like', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy()} onUpdate={onUpdate} />);
    const order = ['General', 'Vehicle', 'Property', 'Rent or bill', 'Loan repayment', 'Tax', 'Insurance premium', 'Tuition', 'Cash-like', 'Custom…'];
    const chips = order.map((label) => screen.getByLabelText(label));
    const group = chips[0]!.parent!.parent!.parent!;
    const labelsInTree = (node: typeof group): string[] =>
      node.children.flatMap((c) => (typeof c === 'string' ? [] : [...(typeof c.props.accessibilityLabel === 'string' ? [c.props.accessibilityLabel as string] : []), ...labelsInTree(c)]));
    expect(labelsInTree(group).filter((l) => order.includes(l))).toEqual(order);
    expect(ITEM_CHIP_ORDER).toHaveLength(ITEM_TYPES.length);
    expect([...ITEM_CHIP_ORDER].sort()).toEqual([...ITEM_TYPES].sort());
    await fireEvent.press(screen.getByLabelText('Property'));
    expect(last(onUpdate).itemType).toBe('property');
    await fireEvent.press(screen.getByLabelText('Cash-like'));
    expect(last(onUpdate).itemType).toBe('cash_equivalent');
    await fireEvent.press(screen.getByLabelText('Tuition'));
    expect(last(onUpdate).itemType).toBe('tuition');
  });

  it('D-92 Treat like offers the new types', async () => {
    const onUpdate = jest.fn();
    await wrap(<Harness initial={buy()} onUpdate={onUpdate} />);
    await fireEvent.press(screen.getByLabelText('Custom…'));
    await fireEvent.changeText(screen.getByPlaceholderText('Drone'), 'Course');
    await fireEvent.press(screen.getByLabelText('Treat like, General (default)'));
    for (const label of ['Property', 'Tuition', 'Cash-like']) expect(screen.getAllByLabelText(label).length).toBeGreaterThan(1); // the chip and the option
    await fireEvent.press(screen.getAllByLabelText('Tuition').at(-1)!);
    expect(last(onUpdate).itemType).toBe('tuition');
    expect(last(onUpdate).customItemType).toEqual({ name: 'Course', treatLike: 'tuition' });
  });
});
