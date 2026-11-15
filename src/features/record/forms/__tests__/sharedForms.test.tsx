// 05.5-17 (D-18): the pay and bill form content testers see in Decide setup is pinned by render snapshots taken before the forms moved
// to src/features/record/forms. The snapshots must not change when the shared bodies are hosted inside the Decide frame.
import React from 'react';
import { screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { BillSheet } from '@/features/decide/screens/setup/items/BillSheets';
import { OtherIncomeSheet, PayEditSheet } from '@/features/decide/screens/setup/items/PaySheets';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => false }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticWarn: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const ACCOUNTS = [
  { id: 'acc-1', name: 'Everyday', currency: 'USD', kind: 'checking', deleted_at: null, archived_at: null },
  { id: 'acc-2', name: 'Savings', currency: 'USD', kind: 'savings', deleted_at: null, archived_at: null },
] as never;
jest.setTimeout(60000);
const noop = (): void => undefined;

// A compact outline of what the form shows (text, labels, roles, state), so the snapshot is stable and readable and ignores style objects.
type Node = { type: string; props?: Record<string, unknown>; children?: (Node | string)[] | null };
const KEEP = ['accessibilityLabel', 'accessibilityRole', 'accessibilityState', 'accessibilityHint', 'testID', 'value', 'placeholder', 'maxLength', 'inputMode', 'editable'];
function outline(n: Node | string | null | (Node | string)[]): unknown {
  if (n === null) return null;
  if (Array.isArray(n)) return n.map(outline);
  if (typeof n === 'string') return n;
  const props: Record<string, unknown> = {};
  for (const k of KEEP) if (n.props?.[k] !== undefined) props[k] = n.props[k];
  return { t: n.type, ...(Object.keys(props).length > 0 ? { p: props } : {}), ...(n.children ? { c: n.children.map(outline) } : {}) };
}
const shown = (): unknown => outline(screen.toJSON() as never);

describe('Decide setup pay and bill form content (06.1 look, pinned)', () => {
  it('Change your pay', async () => {
    await wrap(<PayEditSheet visible amount={320000} day={15} accountId="acc-1" accounts={ACCOUNTS} currency="USD" onSave={noop} onDismiss={noop} />);
    expect(shown()).toMatchSnapshot();
  });
  it('Add other income', async () => {
    await wrap(<OtherIncomeSheet visible currency="USD" onAdd={noop} onDismiss={noop} />);
    expect(shown()).toMatchSnapshot();
  });
  it('Change a bill', async () => {
    await wrap(<BillSheet visible mode="edit" currency="USD" initial={{ name: 'Rent', amount: 120000, day: 1, freq: 'monthly' }} onSave={noop} onDismiss={noop} onStop={noop} />);
    expect(shown()).toMatchSnapshot();
  });
  it('Add a bill it missed', async () => {
    await wrap(<BillSheet visible mode="add" currency="USD" onSave={noop} onDismiss={noop} />);
    expect(shown()).toMatchSnapshot();
  });
});
