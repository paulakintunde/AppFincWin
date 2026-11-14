/**
 * 06.2 D-25 / D-15 / D-17: the play-once animated icon for real milestones.
 *
 * - Plays once: autoPlay, no looping, speed 1 (DURATION.icon, 1-1.3 s, is the length the Lottie files are drawn to),
 *   then rests on its last frame. Nothing loops (D-01).
 * - One animated icon at a time (D-15): a module-level slot. A second icon mounted while one plays shows its still
 *   Glyph. The slot is released when the animation finishes, on unmount, on Reduce Motion, or on a render error.
 * - D-25 fallback: lottie-react-native is a native module. A phone on a build without it (an older dev client or
 *   preview build) has no `LottieAnimationView` registered, so lottieAvailable() is false and the still Glyph (the
 *   icon's last frame) shows. The package is required lazily, only when the native view is present, and the Lottie
 *   branch sits inside an error boundary whose fallback is the same Glyph. It never crashes.
 * - D-17: with Reduce Motion on, the still Glyph shows and nothing plays.
 * - Hidden from accessibility: the word beside the icon carries the meaning (D-06).
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { UIManager, View } from 'react-native';
import { useMotion } from '@/theme/motion';
import { Glyph } from './Glyph';
import type { IconName } from './iconData';

/** The native component name registered by lottie-react-native (its codegenNativeComponent spec). */
const NATIVE_NAME = 'LottieAnimationView';

let availableCache: boolean | null = null;

/** True when the running binary has the Lottie native view. Cached after the first answer. */
export function lottieAvailable(): boolean {
  if (availableCache !== null) return availableCache;
  let found = false;
  try {
    const ui = UIManager as unknown as { hasViewManagerConfig?: (name: string) => boolean };
    if (typeof ui.hasViewManagerConfig === 'function' && ui.hasViewManagerConfig(NATIVE_NAME)) found = true;
    if (!found) {
      // New Architecture (bridgeless): the component registry the bridgeless UIManager itself reads.
      const g = globalThis as unknown as { __nativeComponentRegistry__hasComponent?: (name: string) => boolean };
      if (typeof g.__nativeComponentRegistry__hasComponent === 'function' && g.__nativeComponentRegistry__hasComponent(NATIVE_NAME)) found = true;
    }
  } catch {
    found = false;
  }
  availableCache = found;
  return found;
}

type LottieComponent = React.ComponentType<{
  source: object;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  onAnimationFinish?: (isCancelled: boolean) => void;
  style?: object;
  colorFilters?: { keypath: string; color: string }[];
  testID?: string;
}>;

let lottieModule: LottieComponent | null | undefined;

function loadLottie(): LottieComponent | null {
  if (lottieModule !== undefined) return lottieModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('lottie-react-native') as { default?: LottieComponent };
    lottieModule = mod.default ?? null;
  } catch {
    lottieModule = null;
  }
  return lottieModule;
}

/** D-15: the one-animated-icon-at-a-time slot. Holds the token of the icon that is playing. */
let slot: object | null = null;

function claimSlot(token: object): boolean {
  if (slot !== null) return false;
  slot = token;
  return true;
}

function releaseSlot(token: object): void {
  if (slot === token) slot = null;
}

type LottieHostProps = React.ComponentProps<LottieComponent>;

/** A module-level host so the lazily loaded view is never a component created during render. */
function LottieHost(props: LottieHostProps) {
  const Lottie = loadLottie();
  return Lottie ? React.createElement(Lottie, props) : null;
}

/** Tests only: forget the cached availability, the loaded module and the slot. */
export function resetAnimatedIcons(): void {
  availableCache = null;
  lottieModule = undefined;
  slot = null;
}

class LottieBoundary extends React.Component<{ fallback: React.ReactNode; onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface AnimatedIconProps {
  /** The Lottie JSON (required by the caller). */
  source: object;
  /** The still icon: the animation's last frame, shown whenever the animation does not play. */
  still: IconName;
  color: string;
  size?: 24 | 48;
  testID?: string;
}

export function AnimatedIcon({ source, still, color, size = 24, testID }: AnimatedIconProps) {
  const { reduced } = useMotion();
  const [token] = useState<object>(() => ({}));
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  // The slot is claimed in a layout effect, not during render: a render React throws away (an error retry, Strict
  // Mode) must not hold the slot. Layout effects run before paint, so the first frame drawn is already the animation.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- claims the shared one-icon slot (module state) once, on mount
    if (!reduced && lottieAvailable() && loadLottie() !== null && claimSlot(token)) setPlaying(true);
    return () => releaseSlot(token);
    // Mount only: an icon decides once whether it plays (D-15 plays once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  // Release as soon as Reduce Motion turns on (its first answer arrives after mount).
  useEffect(() => {
    if (reduced) releaseSlot(token);
  }, [reduced, token]);

  const box = { width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const };
  const glyph = (
    <View style={box} testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Glyph name={still} size={24} color={color} testID={testID ? `${testID}-still` : undefined} />
    </View>
  );

  if (!playing || reduced || failed) return glyph;

  return (
    <View style={box} testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <LottieBoundary
        fallback={<Glyph name={still} size={24} color={color} testID={testID ? `${testID}-still` : undefined} />}
        onError={() => {
          releaseSlot(token);
          setFailed(true);
        }}
      >
        <LottieHost
          source={source}
          autoPlay
          loop={false}
          speed={1}
          style={{ width: size, height: size }}
          onAnimationFinish={() => releaseSlot(token)}
          testID={testID ? `${testID}-lottie` : undefined}
        />
      </LottieBoundary>
    </View>
  );
}
