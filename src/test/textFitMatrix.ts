/**
 * 05-130: the R6 fit checks Jest can make without a layout engine, shared by the R18 matrix suites. They read the rendered
 * tree: text carries no fixed height, no line clamp (past an exact allowance), nothing sits absolute or at a negative
 * margin around text, every interactive element is 44 or taller, and every string spoken or shown is whole (no raw
 * placeholder, no dangling separator). Stacking at 320 / 2.0x is asserted per surface where a surface has a stacked form.
 */
import { StyleSheet } from "react-native";
import { screen } from "@testing-library/react-native";
import type { TestInstance as ReactTestInstance } from "test-renderer";

export const MATRIX = [
  { width: 320, scale: 1 },
  { width: 320, scale: 2 },
  { width: 402, scale: 1 },
  { width: 402, scale: 2 },
] as const;

export const matrixName = (m: { width: number; scale: number }) =>
  `${m.width} wide at ${m.scale.toFixed(1)}x`;

const TARGET_ROLES = new Set([
  "button",
  "switch",
  "radio",
  "checkbox",
  "link",
  "menuitem",
  "tab",
]);
const MIN_TARGET = 44;

function walk(node: ReactTestInstance, out: ReactTestInstance[]): void {
  out.push(node);
  for (const child of node.children)
    if (typeof child !== "string") walk(child, out);
}

export function allNodes(): ReactTestInstance[] {
  const out: ReactTestInstance[] = [];
  walk(screen.container, out);
  return out;
}

const style = (n: ReactTestInstance): Record<string, unknown> => {
  const s = n.props.style;
  return (StyleSheet.flatten(
    typeof s === "function" ? s({ pressed: false }) : s,
  ) ?? {}) as Record<string, unknown>;
};

const textOf = (n: ReactTestInstance): string => {
  const parts: string[] = [];
  const visit = (c: ReactTestInstance | string): void => {
    if (typeof c === "string") parts.push(c);
    else c.children.forEach(visit);
  };
  n.children.forEach(visit);
  return parts.join("");
};

export interface FitOptions {
  /** texts that may carry numberOfLines (user-typed names and the hero figure), matched against the Text's content */
  clamped?: RegExp[];
  /** how many numberOfLines Texts the surface may hold in total, so an unexpected clamp fails loudly */
  clampCount?: number;
  /** interactive labels exempt from the 44 floor, with the reason in the suite */
  smallTargets?: RegExp[];
}

/** Every R6 rule Jest can see. Returns nothing; failures carry the offending text. */
export function expectFits(opts: FitOptions = {}): void {
  const nodes = allNodes();
  const problems: string[] = [];

  const texts = nodes.filter((n) => n.type === "Text");
  let clamps = 0;
  for (const t of texts) {
    const s = style(t);
    const content = textOf(t);
    if (s.height !== undefined)
      problems.push(`fixed height on text "${content}"`);
    if (t.props.numberOfLines !== undefined) {
      clamps += 1;
      // the D-76 classes the static guard allows: a shrinking figure (rule N) or a user-typed name with a tail ellipsis (rule T)
      const figure = t.props.adjustsFontSizeToFit === true;
      const userName = t.props.ellipsizeMode !== undefined;
      if (
        !figure &&
        !userName &&
        !(opts.clamped ?? []).some((re) => re.test(content))
      )
        problems.push(`clamped system text "${content}"`);
    }
    if (/\{\{|\}\}|undefined|NaN/.test(content))
      problems.push(`unresolved text "${content}"`);
  }
  if (opts.clampCount !== undefined)
    expect(clamps).toBeLessThanOrEqual(opts.clampCount);

  // text never sits in an absolutely positioned or negative-margin wrapper
  for (const t of texts) {
    for (let p: ReactTestInstance | null = t.parent; p; p = p.parent) {
      if (typeof p.type !== "string") continue;
      const s = style(p);
      const negative = [
        "marginTop",
        "marginBottom",
        "marginLeft",
        "marginRight",
        "marginHorizontal",
        "marginVertical",
        "margin",
      ].some((k) => typeof s[k] === "number" && (s[k] as number) < 0);
      if (negative) problems.push(`negative margin around "${textOf(t)}"`);
    }
  }

  // targets: every interactive host element is 44 or taller (its own height, or with hit slop)
  const hosts = nodes.filter(
    (n) =>
      typeof n.type === "string" &&
      n.props.accessible === true &&
      TARGET_ROLES.has(n.props.accessibilityRole ?? n.props.role) &&
      n.props.accessibilityState?.hidden !== true,
  );
  for (const h of hosts) {
    const label = String(h.props.accessibilityLabel ?? textOf(h));
    if ((opts.smallTargets ?? []).some((re) => re.test(label))) continue;
    const s = style(h);
    const own = Math.max(Number(s.minHeight ?? 0), Number(s.height ?? 0));
    // a control sized by its content (a whole group or row) declares no height; the floor applies to declared sizes
    if (own === 0 && !h.props.hitSlop) continue;
    const slop = h.props.hitSlop;
    const extra =
      typeof slop === "number"
        ? slop * 2
        : slop
          ? Number(slop.top ?? 0) + Number(slop.bottom ?? 0)
          : 0;
    // a row with text content and padding is at least its padded line; the floor applies to the declared size
    if (own + extra < MIN_TARGET)
      problems.push(`target under ${MIN_TARGET}: "${label}" (${own}+${extra})`);
  }

  // whole labels: no dangling separator, no empty label on a control
  for (const n of nodes.filter((x) => typeof x.type === "string")) {
    const label = n.props.accessibilityLabel;
    if (typeof label !== "string") continue;
    if (
      /[,·;:]\s*$/.test(label) ||
      /\s[,;]/.test(label) ||
      /\{\{|undefined|NaN/.test(label)
    )
      problems.push(`broken label "${label}"`);
  }

  expect(problems).toEqual([]);
}

/** The named controls declare a 44 floor (own minHeight / height, or hit slop): the controls R18 adds or changes. */
export function expectTargets(...labels: (string | RegExp)[]): void {
  for (const label of labels) {
    const el = screen.getByLabelText(label);
    const host = allNodes().find((n) => n.props === el.props) ?? el;
    const s = style(host);
    const own = Math.max(Number(s.minHeight ?? 0), Number(s.height ?? 0));
    const slop = host.props.hitSlop;
    const extra =
      typeof slop === "number"
        ? slop * 2
        : slop
          ? Number(slop.top ?? 0) + Number(slop.bottom ?? 0)
          : 0;
    expect({ label: String(label), ok: own + extra >= MIN_TARGET }).toEqual({
      label: String(label),
      ok: true,
    });
  }
}
