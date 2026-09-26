// D-12: Google's official "G" mark, fetched via the signin-assets.zip linked from
// developers.google.com/identity/branding-guidelines ("Android + Web" / SVG / Light /
// "Show text=No, Shape=Square"). Verified live (2026-09-25): Google's current button asset
// replaced the historical flat four-colour G with a masked group of blurred gradient
// ellipses -- confirmed by downloading the zip and by comparing against the same-guidelines
// page's standalone /static/identity/images/g-logo.png, which renders identically. The
// markup below is that mask+ellipses group verbatim; the button's own white background
// chip/border are dropped since FincWin supplies its own outline pill (D-12), and the
// viewBox is re-scoped from the original 40x40 button canvas to the mask's own 20x20 region
// so the mark fills its slot with no dead margin.
//
// The official asset also ships a base path, beneath the colour blobs, whose fill is a CSS
// conic-gradient embedded in a <foreignObject> (Figma's browser-only fallback for a gradient
// type plain SVG has no native equivalent for). That path is deliberately omitted here: it
// carries no usable fill outside a browser, and Google's own colour-blob layer beneath it
// is the graceful-degradation rendering for every other SVG consumer, not an invented
// approximation. `style="mask-type:alpha"` is preserved from the original -- without it the
// mask would use the fill's luminance instead of its alpha, changing the shape's edges.
import { useId } from 'react';
import { SvgXml } from 'react-native-svg';

export interface GoogleMarkProps {
  size?: number;
}

export function GoogleMark({ size = 18 }: GoogleMarkProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const mask = `m${uid}`;
  const f = (n: number) => `f${n}${uid}`;

  const xml = `
<svg viewBox="10 10 20 20" xmlns="http://www.w3.org/2000/svg">
<defs>
<mask id="${mask}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="10" y="10" width="20" height="20">
<path d="M29.3987 18.1814H19.9849V22.0445H25.3598C25.1286 23.294 24.4294 24.3596 23.3676 25.0712C22.4746 25.6716 21.3266 26.0211 19.9849 26.0211C17.3864 26.0211 15.1823 24.2666 14.3947 21.9004C14.1952 21.2989 14.0853 20.6599 14.0853 19.9983C14.0853 19.3367 14.1952 18.6966 14.3947 18.0962C15.1823 15.7311 17.3864 13.9755 19.9849 13.9755C21.4524 13.9755 22.767 14.4816 23.8039 15.4713L26.6653 12.6057C24.936 10.9908 22.6786 10 19.9849 10C16.0832 10 12.705 12.2414 11.0618 15.5076C10.383 16.8592 10 18.3834 10 19.9994C10 21.6155 10.383 23.1396 11.0618 24.4913C12.705 27.7597 16.0832 30 19.9849 30C22.6797 30 24.9485 29.1137 26.6018 27.5861C28.4887 25.8452 29.5732 23.2702 29.5732 20.2275C29.5732 19.5182 29.5131 18.835 29.3987 18.1825V18.1814Z" fill="#E94FFF"/>
</mask>
<filter id="${f(1)}" x="12.9977" y="14.828" width="14.1038" height="10.8265" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="${f(2)}" x="23.9146" y="13.1219" width="18.8784" height="10.1871" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="${f(3)}" x="15.8659" y="11.8415" width="18.8171" height="8.7561" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="${f(4)}" x="20.1341" y="8.54878" width="18.8171" height="8.7561" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="${f(5)}" x="13.9756" y="14.7683" width="21.0122" height="10.2195" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="${f(6)}" x="19.0404" y="9.00419" width="12.2878" height="10.0309" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1"/></filter>
</defs>
<g mask="url(#${mask})">
<g filter="url(#${f(1)})"><ellipse cx="20.0496" cy="20.2413" rx="5.39634" ry="2.83537" transform="rotate(24.4473 20.0496 20.2413)" fill="#3186FF"/></g>
<g filter="url(#${f(2)})"><ellipse cx="33.3538" cy="18.2155" rx="7.43918" ry="3.09357" fill="#3186FF"/></g>
<g filter="url(#${f(3)})"><ellipse cx="25.2744" cy="16.2195" rx="7.40854" ry="2.37805" fill="#FF4641"/></g>
<g filter="url(#${f(4)})"><ellipse cx="29.5427" cy="12.9268" rx="7.40854" ry="2.37805" fill="#FF5B8B"/></g>
<g filter="url(#${f(5)})"><ellipse cx="24.4817" cy="19.878" rx="8.5061" ry="3.10976" fill="#3186FF"/></g>
<g filter="url(#${f(6)})"><ellipse cx="25.1842" cy="14.0197" rx="4.53882" ry="2.37805" transform="rotate(-28.6599 25.1842 14.0197)" fill="#FF4641"/></g>
</g>
</svg>`;

  return <SvgXml xml={xml} width={size} height={size} />;
}
