/**
 * 05.4-07: the Decide audit people (report of 2026-10-31) as invented-person fixtures (D-04). Each audit case A1..A22
 * names one person in audit-persona-map.json; the cases where only the purchase or the answer differs share a person.
 * The persons live in audit-personas.json, apart from personas.json, so the older golden and property suites keep the
 * same nine people. Nobody here is real.
 *
 * 05.4-40 (FIN-26, D-132, D-133): each A-id is also a golden. It is pinned by every approved right-answer case whose persona
 * starts with it ("A9 and A20 Tom", "A5, A6 and A7 Jordan"); A8 by the one-person SN-25 and SN-26 (HH-01, the household
 * version, waits for phase 8). A pinned case must not sit in knownRed, and the generosity guard fails with
 * "A<n> became more generous" when the engine's headline is looser than the approved one, or the approved warning is gone.
 */
import { evaluate } from "../../evaluate";
import { CODE_PRECEDENCE } from "../../constants";
import { toEngineInputs } from "../rightAnswers/fixture";
import { loadCases, loadKnownRed } from "../rightAnswers/loader";
import { pick, type Picked } from "../rightAnswers/pick";
import { TOPICS, type Expected, type RightAnswerCase } from "../rightAnswers/schema";
import mapFile from "./audit-persona-map.json";
import auditFile from "./audit-personas.json";
import {
  toCheckV2,
  toV3Inputs,
  type FixturePerson,
  type FixturePurchase,
} from "./adapter";

const PERSONS = (auditFile as unknown as { persons: FixturePerson[] }).persons;
const MAP = mapFile as unknown as Record<string, string>;
const A_IDS = Array.from({ length: 22 }, (_, i) => `A${i + 1}`);

const PLAIN: FixturePurchase = {
  price: 10_000,
  taxPercent: null,
  oneOffFees: 0,
  itemType: "general",
  purpose: null,
  emergency: false,
  envelopeId: null,
  categoryId: null,
  pay: { mode: "once" },
  extras: {},
  share: "personal",
  foreign: null,
};

describe("audit personas (05.4-07)", () => {
  it("the map names exactly A1..A22", () => {
    expect(Object.keys(MAP)).toEqual(A_IDS);
  });

  it("every person id is unique and in GBP", () => {
    expect(new Set(PERSONS.map((p) => p.id)).size).toBe(PERSONS.length);
    for (const p of PERSONS) expect(p.currency).toBe("GBP");
  });

  it("every person is used by some audit case", () => {
    expect(new Set(Object.values(MAP))).toEqual(
      new Set(PERSONS.map((p) => p.id)),
    );
  });

  for (const a of A_IDS) {
    it(`audit persona ${a} exists and evaluates`, () => {
      const person = PERSONS.find((p) => p.id === MAP[a]);
      expect(person).toBeDefined();
      const ev = evaluate(
        toV3Inputs(person as FixturePerson),
        toCheckV2(PLAIN),
      );
      expect(ev.result.code).toBeDefined();
    });
  }
});

/** The A-ids a persona names at its start: "A9 and A20 Tom" -> A9, A20; "A5, A6 and A7 Jordan" -> A5, A6, A7. */
function auditIdsOf(persona: string): string[] {
  const head = /^A\d+(?:(?:, | and |, and )A\d+)*\b/.exec(persona);
  return head === null ? [] : head[0].match(/A\d+/g) ?? [];
}

const rank = (code: string): number => (CODE_PRECEDENCE as readonly string[]).indexOf(code);

/**
 * D-133: null when the engine's answer is no more generous than the approved one; else why. Lower CODE_PRECEDENCE index =
 * stricter. Looser headline = a higher index. Same headline with the approved warning (variant) gone or swapped = looser too.
 */
function moreGenerous(expected: Pick<Expected, "code" | "variant">, got: Pick<Picked, "code" | "variant">): string | null {
  if (rank(got.code) > rank(expected.code)) return `headline ${expected.code} -> ${got.code}`;
  if (got.code === expected.code && expected.variant !== null && got.variant !== expected.variant) {
    return `warning ${expected.variant} -> ${String(got.variant)}`;
  }
  return null;
}

const CASES: RightAnswerCase[] = loadCases();
const RED = new Map(TOPICS.flatMap((t) => loadKnownRed(t).map((r) => [r.id, r.fixId] as const)));
const pinsOf = (a: string): RightAnswerCase[] => CASES.filter((c) => c.status === "approved" && auditIdsOf(c.persona).includes(a));

describe("audit personas as goldens (05.4-40, FIN-26)", () => {
  it("the persona parser reads one, two and three A-ids, and nothing else", () => {
    expect(auditIdsOf("A8 Robin, own share only (audit, invented)")).toEqual(["A8"]);
    expect(auditIdsOf("A9 and A20 Tom (audit, invented)")).toEqual(["A9", "A20"]);
    expect(auditIdsOf("A5, A6 and A7 Jordan, freelancer (audit, invented)")).toEqual(["A5", "A6", "A7"]);
    expect(auditIdsOf("Leo (invented)")).toEqual([]);
    expect(auditIdsOf("Ana A3 (invented)")).toEqual([]);
  });

  it("the generosity guard catches a looser headline and a lost warning, and passes a stricter one", () => {
    expect(moreGenerous({ code: "not_yet", variant: "not_covered" }, { code: "fits_month", variant: null })).toMatch(/headline/);
    expect(moreGenerous({ code: "fits_month", variant: "tight" }, { code: "fits_month", variant: null })).toMatch(/warning tight -> null/);
    expect(moreGenerous({ code: "fits_month", variant: "tight" }, { code: "fits_month", variant: "no_net" })).toMatch(/warning/);
    expect(moreGenerous({ code: "fits_month", variant: "tight" }, { code: "not_yet", variant: null })).toBeNull();
    expect(moreGenerous({ code: "fits_month", variant: null }, { code: "fits_month", variant: "tight" })).toBeNull();
    expect(moreGenerous({ code: "fits_by_borrowing", variant: null }, { code: "fits_by_borrowing", variant: null })).toBeNull();
  });

  it("every approved case that names an A-id names only A1..A22", () => {
    const named = CASES.filter((c) => c.status === "approved").flatMap((c) => auditIdsOf(c.persona));
    expect(named.filter((a) => !A_IDS.includes(a))).toEqual([]);
  });

  for (const a of A_IDS) {
    it(`audit persona ${a} golden`, () => {
      const pins = pinsOf(a);
      if (pins.length === 0) throw new Error(`${a} has no approved right-answer case`);
      for (const c of pins) {
        const red = RED.get(c.id);
        if (red !== undefined) throw new Error(`${a}: ${c.id} is still in knownRed (${red})`);
        const { inputs, check } = toEngineInputs(c.fixture);
        const why = moreGenerous(c.expected, pick(evaluate(inputs, check)));
        if (why !== null) throw new Error(`${a} became more generous: ${c.id} ${why}`);
      }
    });
  }
});
