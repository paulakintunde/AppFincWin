// D-12: Google's official "G" mark. Fetched from
// https://developers.google.com/static/identity/images/g-logo.png -- the standalone,
// transparent-background mark Google's own branding-guidelines page itself links to,
// distinct from the button-asset zip's chip-with-border variants.
//
// Deviation (Rule 1 - bug, found live on a real device during this plan's own emulator
// verification step): the first implementation reproduced Google's button-asset SVG (a
// masked group of blurred gradient ellipses -- Google's 2026 mark redesign replaced the
// historical flat four-colour G with this look) via react-native-svg's <Filter>/
// <FeGaussianBlur>. It rendered correctly in Jest (jsdom-less RNTL snapshot) but produced no
// visible mark at all on a real Android device -- react-native-svg's Android backend
// (com.horcrux.svg, Canvas-based) does not render that filter+mask combination, confirmed by
// a real APK screenshot showing an empty gap where the mark should be, with no error logged.
// A pre-rasterised PNG of Google's own official standalone mark sidesteps that renderer gap
// entirely and is guaranteed to render identically across iOS/Android, at the cost of losing
// vector scaling above its native ~200x204px source (irrelevant at this component's 18px
// render size).
import { Image } from 'react-native';

const GOOGLE_G_MARK = require('../../../../assets/brand/google-g-mark.png') as number;

export interface GoogleMarkProps {
  size?: number;
}

export function GoogleMark({ size = 18 }: GoogleMarkProps) {
  return (
    <Image
      source={GOOGLE_G_MARK}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
