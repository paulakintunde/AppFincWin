import React from 'react';
import { CloseGlyph, FilterGlyph, MoreGlyph, SearchGlyph } from '../HeaderGlyphs';

// The glyphs are pure function components, so the drawn geometry is asserted on the element tree
// they return (react-native-svg host props are rewritten by its native shim in the renderer).
type El = React.ReactElement<Record<string, unknown>>;

function expand(el: El): El {
  // Resolve the local Frame wrapper (a function component) to the Svg element it returns.
  return (el.type as (p: unknown) => El)(el.props);
}

function shapes(svg: El): El[] {
  return React.Children.toArray(svg.props.children as React.ReactNode) as El[];
}

const GLYPHS = [
  ['SearchGlyph', SearchGlyph],
  ['FilterGlyph', FilterGlyph],
  ['MoreGlyph', MoreGlyph],
] as const;

describe('HeaderGlyphs', () => {
  it.each(GLYPHS)('%s is a hidden 22-unit Svg at size.tabIcon', (_name, Glyph) => {
    const svg = expand(Glyph({ color: '#000000' }) as El);
    expect(svg.props).toMatchObject({
      viewBox: '0 0 22 22',
      width: 22,
      height: 22,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  it('SearchGlyph draws the ring and the 0.45 handle', () => {
    const svg = expand(SearchGlyph({ color: '#000000' }) as El);
    const [ring, handle] = shapes(svg) as [El, El];
    expect(ring.props).toMatchObject({ cx: 9.6, cy: 9.6, r: 5.9, strokeWidth: 2.2, opacity: 1 });
    expect(handle.props).toMatchObject({
      d: 'M14.2 14.2 18.6 18.6',
      strokeWidth: 2.4,
      strokeLinecap: 'round',
      opacity: 0.45,
    });
    expect(svg).toMatchSnapshot();
  });

  it('FilterGlyph draws three bars of falling width and opacity', () => {
    const svg = expand(FilterGlyph({ color: '#000000' }) as El);
    const bars = shapes(svg);
    expect(bars.map((b) => [b.props.x, b.props.y, b.props.width, b.props.opacity])).toEqual([
      [3, 4, 16, 1],
      [6, 9.8, 10, 0.7],
      [8.5, 15.6, 5, 0.45],
    ]);
    bars.forEach((b) => expect(b.props).toMatchObject({ height: 2.4, rx: 1.2 }));
    expect(svg).toMatchSnapshot();
  });

  it('MoreGlyph draws three dots with the centre one full', () => {
    const svg = expand(MoreGlyph({ color: '#000000' }) as El);
    expect(shapes(svg).map((d) => [d.props.cx, d.props.cy, d.props.r, d.props.opacity])).toEqual([
      [4.5, 11, 2.1, 0.45],
      [11, 11, 2.1, 1],
      [17.5, 11, 2.1, 0.45],
    ]);
    expect(svg).toMatchSnapshot();
  });

  it('CloseGlyph is a 10px cross with round caps', () => {
    const svg = CloseGlyph({ color: '#000000' }) as El;
    expect(svg.props).toMatchObject({ viewBox: '0 0 10 10', width: 10, height: 10 });
    const [a, b] = shapes(svg) as [El, El];
    expect(a.props).toMatchObject({ d: 'M2 2 8 8', strokeWidth: 2, strokeLinecap: 'round' });
    expect(b.props).toMatchObject({ d: 'M8 2 2 8', strokeWidth: 2, strokeLinecap: 'round' });
    expect(svg).toMatchSnapshot();
  });
});
