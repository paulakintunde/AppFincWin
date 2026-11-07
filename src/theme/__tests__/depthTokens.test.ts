import { Platform } from 'react-native';
import { colors, depthShadows, shadows } from '../tokens';
import { textRole } from '../typography';
import { FONT_PAIRINGS, type FontPairingKey } from '../fonts';

function withPlatform<T>(os: string, version: number | string, fn: () => T): T {
  const osSpy = jest.replaceProperty(Platform, 'OS', os as typeof Platform.OS);
  const verSpy = jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version as never);
  try {
    return fn();
  } finally {
    osSpy.restore();
    verSpy.mockRestore();
  }
}

describe('D-31 depth tokens', () => {
  it('uses the fill6 page tone for canvas and the tab bar', () => {
    expect(colors.canvas).toBe('#F6F4EE');
    expect(colors.canvas).toBe(colors.fill6);
    expect(colors.tabBar).toBe('rgba(246,244,238,.94)');
  });

  it('iOS card is a three-layer boxShadow with no legacy shadow keys', () => {
    const s = withPlatform('ios', '18.0', () => depthShadows());
    const card = s.card as Record<string, unknown>;
    expect(typeof card.boxShadow).toBe('string');
    expect((card.boxShadow as string).split('rgba(').length - 1).toBe(3);
    expect(card).not.toHaveProperty('elevation');
    expect(card).not.toHaveProperty('shadowOpacity');
  });

  it('edge is a two-layer boxShadow', () => {
    const s = withPlatform('ios', '18.0', () => depthShadows());
    const edge = s.edge as Record<string, unknown>;
    expect((edge.boxShadow as string).split('rgba(').length - 1).toBe(2);
  });

  it('Android API 26 falls back to elevation for card and nothing for edge', () => {
    const s = withPlatform('android', 26, () => depthShadows());
    expect(s.card).toEqual({ elevation: 3 });
    expect(s.edge).toEqual({});
  });

  it('Android API 34 uses boxShadow', () => {
    const s = withPlatform('android', 34, () => depthShadows());
    expect(s.card).toHaveProperty('boxShadow');
    expect(s.edge).toHaveProperty('boxShadow');
  });

  it('fab is unchanged', () => {
    expect(shadows.fab).toEqual({
      shadowColor: '#14150F',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 6,
    });
  });
});

describe('bodyStrong role', () => {
  for (const key of Object.keys(FONT_PAIRINGS) as FontPairingKey[]) {
    it(`matches body metrics with the 600 face for ${key}`, () => {
      const body = textRole(key, 'body');
      const strong = textRole(key, 'bodyStrong');
      expect(strong.fontSize).toBe(body.fontSize);
      expect(strong.lineHeight).toBe(body.lineHeight);
      expect(strong.letterSpacing).toBe(body.letterSpacing);
      expect(strong.fontFamily).toBe(FONT_PAIRINGS[key].body[600]);
      expect(strong).not.toHaveProperty('fontWeight');
    });
  }
});
