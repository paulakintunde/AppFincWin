/**
 * 05.4-07: the Decide audit people (report of 2026-10-31) as invented-person fixtures (D-04). Each audit case A1..A22
 * names one person in audit-persona-map.json; the cases where only the purchase or the answer differs share a person.
 * The persons live in audit-personas.json, apart from personas.json, so the older golden and property suites keep the
 * same nine people. Nobody here is real.
 */
import { evaluate } from "../../evaluate";
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
