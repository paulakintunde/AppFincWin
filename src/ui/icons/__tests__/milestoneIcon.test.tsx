// 06.2-08 (D-03, D-15, D-19, D-25, D-29): the milestone animated icons and the Lottie files behind them.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { UIManager } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { resetAnimatedIcons } from '../AnimatedIcon';
import { Glyph } from '../Glyph';
import { ICONS, type IconName } from '../iconData';
import { MILESTONE_NAMES, MilestoneIcon, type MilestoneName } from '../MilestoneIcon';

let mockReduced = false;
const mockLottieProps: Record<string, unknown>[] = [];

jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => ms, easing: undefined, fade: (ms: number) => ms }),
}));

jest.mock('lottie-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (p: Record<string, unknown>) => {
      mockLottieProps.push(p);
      return React.createElement(View, { testID: 'lottie-view' });
    },
  };
});

// Other suites share the machine; render cases can be slow under load.
jest.setTimeout(30000);

const H = { includeHiddenElements: true };
const COLOR = '#123456';
const ui = UIManager as unknown as { hasViewManagerConfig: (name: string) => boolean };

const STILL: Record<MilestoneName, IconName> = {
  goalReached: 'stateFits',
  debtCleared: 'stateFits',
  importDone: 'import',
  firstEntry: 'firstEntry',
  safetyNetLocked: 'stateSafetyNet',
};

function setNative(present: boolean) {
  jest.spyOn(ui, 'hasViewManagerConfig').mockImplementation((name: string) => present && name === 'LottieAnimationView');
}

beforeEach(() => {
  resetAnimatedIcons();
  mockReduced = false;
  mockLottieProps.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MilestoneName (D-19)', () => {
  it('is exactly the five milestones whose feature exists on main', () => {
    expect([...MILESTONE_NAMES].sort()).toEqual(['debtCleared', 'firstEntry', 'goalReached', 'importDone', 'safetyNetLocked']);
  });
});

describe('MilestoneIcon', () => {
  it.each(MILESTONE_NAMES)('%s plays its own Lottie file once, theme-coloured on both layers', async (name) => {
    setNative(true);
    await render(<MilestoneIcon name={name} color={COLOR} testID="m" />);
    expect(screen.getByTestId('lottie-view', H)).toBeTruthy();
    const props = mockLottieProps[mockLottieProps.length - 1]!;
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../assets/lottie', `${name}.json`), 'utf8'));
    expect(props.source).toEqual(file);
    expect(props.loop).toBe(false);
    expect(props.colorFilters).toEqual([
      { keypath: 'back', color: COLOR },
      { keypath: 'front', color: COLOR },
    ]);
    expect(props.style).toEqual({ width: 48, height: 48 });
  });

  it.each(MILESTONE_NAMES)('%s shows its still Glyph on a build without the native view (D-25)', async (name) => {
    setNative(false);
    await render(<MilestoneIcon name={name} color={COLOR} testID="m" />);
    expect(screen.queryByTestId('lottie-view', H)).toBeNull();
    expect(screen.getByTestId('m-still', H)).toBeTruthy();
    // The box holds exactly the still icon's drawing.
    const box = screen.toJSON() as { children: unknown[] };
    const shown = JSON.stringify(box.children[0]);
    await render(<Glyph name={STILL[name]} size={24} color={COLOR} testID="m-still" />);
    expect(shown).toBe(JSON.stringify(screen.toJSON()));
  });

  it('shows the still Glyph under Reduce Motion (D-17)', async () => {
    setNative(true);
    mockReduced = true;
    await render(<MilestoneIcon name="safetyNetLocked" color={COLOR} testID="m" />);
    expect(screen.queryByTestId('lottie-view', H)).toBeNull();
    expect(screen.getByTestId('m-still', H)).toBeTruthy();
  });
});

type Key = { t: number; s: number[] };
type Prop = { a: 0 | 1; k: unknown };
type Item = { ty: string; nm?: string; it?: Item[]; e?: Prop; o?: Prop; p?: Prop };

/** The value a property rests on after the last keyframe (Lottie holds the last key). */
function lastValue(p: Prop): unknown {
  if (p.a === 0) return p.k;
  const keys = p.k as Key[];
  return keys[keys.length - 1]!.s;
}

function lastKeyTime(p: Prop): number {
  if (p.a === 0) return 0;
  const keys = p.k as Key[];
  return keys[keys.length - 1]!.t;
}

function walk(items: Item[], out: Item[] = []): Item[] {
  for (const item of items) {
    out.push(item);
    if (item.it) walk(item.it, out);
  }
  return out;
}

describe('the Lottie files (D-03, D-15, D-29)', () => {
  it.each(MILESTONE_NAMES)('%s: 1.2 s at 60 fps, and its last frame is the still drawing', (name) => {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../assets/lottie', `${name}.json`), 'utf8'));
    expect([j.v, j.fr, j.ip, j.op, j.w, j.h]).toEqual(['5.7.0', 60, 0, 72, 24, 24]);
    expect(j.layers.map((l: { nm: string }) => l.nm)).toEqual(['front', 'back']);
    const [front, back] = j.layers;

    // Back layer rests at 45% (the board's <g opacity=".45">); front layer at full opacity.
    expect(lastValue(back.ks.o)).toEqual([45]);
    expect(lastValue(front.ks.o)).toBe(100);

    // Same element count as the still icon (generated from the same board drawing, not redrawn).
    const icon = ICONS[STILL[name]] as unknown as { back: unknown[]; front: unknown[] };
    expect(back.shapes).toHaveLength(icon.back.length);
    expect(front.shapes).toHaveLength(icon.front.length);

    const items = [...walk(front.shapes), ...walk(back.shapes)];
    // Every trim ends fully drawn, every fill fully opaque, every group back at rest.
    for (const it of items) {
      if (it.ty === 'tm') expect(lastValue(it.e!)).toEqual([100]);
      if (it.ty === 'fl' || it.ty === 'st') expect([[100], 100]).toContainEqual(lastValue(it.o!));
      if (it.ty === 'tr') expect([[0, 0]]).toContainEqual(lastValue(it.p!));
      for (const prop of [it.e, it.o, it.p]) if (prop) expect(lastKeyTime(prop)).toBeLessThanOrEqual(72);
    }
    // Plays once and holds: nothing is set to loop or repeat inside the file.
    expect(JSON.stringify(j)).not.toMatch(/"(loop|repeat)"/i);

    const trims = items.filter((i) => i.ty === 'tm');
    if (name === 'safetyNetLocked') {
      // The shackle is already drawn and closes from 3.2 above; the body stays.
      const shackle = items.find((i) => i.nm === 'shackle')!;
      const tr = shackle.it!.find((i) => i.ty === 'tr')!;
      expect((tr.p!.k as Key[])[0]!.s).toEqual([0, -3.2]);
      expect(trims).toHaveLength(0);
    } else {
      expect(trims.length).toBeGreaterThan(0);
    }
  });
});
