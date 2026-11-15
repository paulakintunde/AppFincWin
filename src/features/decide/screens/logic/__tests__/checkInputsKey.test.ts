// 06.1-81 (review item 3): the inputs fingerprint stored with answer_v3 moves on an edit and only on an edit.
import { readStoredCheck, toStoredV2, type CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { checkInputsKey, stableText } from '../checkInputsKey';

const base: CheckV2 = { ...readStoredCheck({}).check, price: minorUnits(120000) };

describe('checkInputsKey', () => {
  it('is the same for the same inputs, and for a stored copy read back', () => {
    expect(checkInputsKey(base)).toBe(checkInputsKey({ ...base }));
    const roundTrip = readStoredCheck(JSON.parse(JSON.stringify(toStoredV2(base)))).check;
    expect(checkInputsKey(roundTrip)).toBe(checkInputsKey(base));
    expect(checkInputsKey(base)).toMatch(/^[0-9a-z]+-[0-9a-f]{8}$/);
  });

  it('moves on a price, emergency or answer edit', () => {
    const k = checkInputsKey(base);
    expect(checkInputsKey({ ...base, price: minorUnits(120001) })).not.toBe(k);
    expect(checkInputsKey({ ...base, emergency: !base.emergency })).not.toBe(k);
    expect(checkInputsKey({ ...base, layerAnswers: { ...base.layerAnswers, 'L0.plan_name': 'Klarna' } })).not.toBe(k);
  });

  it('ignores which steps were visited or skipped', () => {
    const k = checkInputsKey(base);
    expect(checkInputsKey({ ...base, layerAnswers: { ...base.layerAnswers, 'L0.visited_steps': [1, 2], 'L0.skipped_steps': [3] } })).toBe(k);
  });
});

describe('stableText', () => {
  it('sorts keys at every level, drops null and undefined keys, and writes undefined list items as null', () => {
    expect(stableText({ b: 1, a: { d: [1, undefined, 'x'], c: null }, e: undefined })).toBe('{"a":{"d":[1,null,"x"]},"b":1}');
    expect(stableText(undefined)).toBe('null');
    expect(stableText('s')).toBe('"s"');
  });
});
