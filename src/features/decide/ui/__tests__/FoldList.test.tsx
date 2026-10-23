import React, { useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { hapticSelection } from '@/ui/haptics';
import { FoldList, type FoldSpec } from '../FoldList';
import { DetailsToggle } from '../DetailsToggle';
import { CollapsibleSection } from '../CollapsibleSection';
import { RevealTapContext } from '../revealTap';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const ONE = 'What breaks';
const TWO = 'Assumptions';
const PREVIEW_ONE = 'Nothing breaks';
const PREVIEW_TWO = 'Three assumptions';
const BODY_ONE = 'body one';
const BODY_TWO = 'body two';
const GLYPH = 'i';
const ABOUT = 'About What breaks';
const BLOCK = 'the cash path';
const SUMMARY = 'Rate ends in 12 months';
const PROMO = 'Promotional rate';

const GRANT = { persist: () => {}, nativeEvent: { touches: [], changedTouches: [], identifier: 1, timestamp: 0 }, currentTarget: { measure: jest.fn() } };

type Key = 'one' | 'two';

function wrap(ui: React.ReactElement, onReveal?: () => void) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={1}>
        <RevealTapContext.Provider value={onReveal ?? (() => undefined)}>{ui}</RevealTapContext.Provider>
      </FontScaleProvider>
    </ThemeProvider>,
  );
}

function folds(withInfo = false, onAbout: () => void = jest.fn()): FoldSpec<Key>[] {
  return [
    {
      key: 'one',
      title: ONE,
      preview: PREVIEW_ONE,
      info: withInfo ? { node: <Text>{GLYPH}</Text>, aboutLabel: ABOUT, onAbout } : undefined,
      body: <Text>{BODY_ONE}</Text>,
    },
    { key: 'two', title: TWO, preview: PREVIEW_TWO, body: <Text>{BODY_TWO}</Text> },
  ];
}

function Harness({ initial = null, withInfo = false, onAbout }: { initial?: Key | null; withInfo?: boolean; onAbout?: () => void }) {
  const [open, setOpen] = useState<Key | null>(initial);
  return <FoldList folds={folds(withInfo, onAbout)} openKey={open} onOpenChange={setOpen} />;
}

let announce: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('FoldList', () => {
  it('D-74 only one fold is open at a time', async () => {
    const { getByRole, queryByText } = await wrap(<Harness />);
    await fireEvent.press(getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` }));
    expect(queryByText(BODY_ONE)).not.toBeNull();
    await fireEvent.press(getByRole('button', { name: `${TWO}, ${PREVIEW_TWO}` }));
    expect(queryByText(BODY_ONE)).toBeNull();
    expect(queryByText(BODY_TWO)).not.toBeNull();
  });

  it('D-74 tapping the open fold closes it', async () => {
    const { getByRole, queryByText } = await wrap(<Harness initial="one" />);
    expect(queryByText(BODY_ONE)).not.toBeNull();
    await fireEvent.press(getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` }));
    expect(queryByText(BODY_ONE)).toBeNull();
  });

  it('R7 announces the opened and the closed fold', async () => {
    const { getByRole } = await wrap(<Harness />);
    await fireEvent.press(getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` }));
    expect(announce).toHaveBeenLastCalledWith(`${ONE} expanded`);
    await fireEvent.press(getByRole('button', { name: `${TWO}, ${PREVIEW_TWO}` }));
    expect(announce).toHaveBeenLastCalledWith(`${TWO} expanded. ${ONE} collapsed.`);
    await fireEvent.press(getByRole('button', { name: `${TWO}, ${PREVIEW_TWO}` }));
    expect(announce).toHaveBeenLastCalledWith(`${TWO} collapsed`);
  });

  it('D-75 a fold row has a chevron, a preview, a pressed fill and a selection haptic', async () => {
    const { getByRole, getByText } = await wrap(<Harness />);
    const row = getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` });
    expect(getByText(PREVIEW_ONE).props.numberOfLines).toBeUndefined();
    expect(row.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(64);
    expect(StyleSheet.flatten(row.props.style).backgroundColor).toBeUndefined();
    await fireEvent(row, 'responderGrant', GRANT);
    expect(StyleSheet.flatten(getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` }).props.style).backgroundColor).toBeDefined();
    await fireEvent.press(row);
    expect(hapticSelection).toHaveBeenCalledTimes(1);
    expect(getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` }).props.accessibilityState).toEqual(
      expect.objectContaining({ expanded: true }),
    );
  });

  it('D-70 a fold title with an ⓘ exposes the about action', async () => {
    const onAbout = jest.fn();
    const { getByRole } = await wrap(<Harness withInfo onAbout={onAbout} />);
    const row = getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` });
    expect(row.props.accessibilityActions).toEqual([{ name: 'about', label: ABOUT }]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'about' } });
    expect(onAbout).toHaveBeenCalledTimes(1);
  });

  it('D-75 a fold tap reports to the reveal-tap context', async () => {
    const onReveal = jest.fn();
    const { getByRole } = await wrap(<Harness />, onReveal);
    await fireEvent.press(getByRole('button', { name: `${ONE}, ${PREVIEW_ONE}` }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for zero folds', async () => {
    const { toJSON } = await wrap(<FoldList folds={[]} openKey={null} onOpenChange={jest.fn()} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain(ONE);
  });
});

describe('DetailsToggle', () => {
  function Stateful() {
    const [open, setOpen] = useState(false);
    return <DetailsToggle expanded={open} onToggle={() => setOpen(!open)} block={BLOCK} />;
  }

  it('D-75 details toggle flips Show and Hide details with its block in the label', async () => {
    const { getByRole, getByText } = await wrap(<Stateful />);
    const btn = getByRole('button', { name: `Show details, ${BLOCK}` });
    expect(StyleSheet.flatten(btn.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(getByText('Show details')).toBeTruthy();
    await fireEvent.press(btn);
    expect(getByRole('button', { name: `Hide details, ${BLOCK}` }).props.accessibilityState).toEqual(
      expect.objectContaining({ expanded: true }),
    );
    expect(getByText('Hide details')).toBeTruthy();
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('D-75 details toggle reports to the reveal-tap context', async () => {
    const onReveal = jest.fn();
    const { getByRole } = await wrap(<Stateful />, onReveal);
    await fireEvent.press(getByRole('button', { name: `Show details, ${BLOCK}` }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});

describe('CollapsibleSection', () => {
  it('R6 CollapsibleSection stacks title over summary with a chevron', async () => {
    const onToggle = jest.fn();
    const { getByRole, getByText } = await wrap(
      <CollapsibleSection title={PROMO} summary={SUMMARY} expanded={false} onToggle={onToggle}>
        <Text>{BODY_ONE}</Text>
      </CollapsibleSection>,
    );
    const btn = getByRole('button', { name: `${PROMO}, ${SUMMARY}` });
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    const title = getByText(PROMO);
    const summary = getByText(SUMMARY);
    // Same parent column: title and summary are siblings, not a space-between row.
    expect(title.parent).toBe(summary.parent);
    const header = StyleSheet.flatten(btn.props.style);
    expect(header.justifyContent).toBeUndefined();
    await fireEvent.press(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });
});
