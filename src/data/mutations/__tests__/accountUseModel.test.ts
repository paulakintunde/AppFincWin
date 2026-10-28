import { accountUseOfRow, accountUsePatch, emergencyLinkUse } from '../accountUseModel';
import type { AccountUse } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';

const NONE = { use: null, use_purpose: null, use_envelope_id: null, use_extra_set_aside: null };

describe('accountUsePatch / accountUseOfRow', () => {
  const cases: [string, AccountUse | null, unknown][] = [
    ['everyday', { kind: 'everyday' }, { ...NONE, use: 'everyday' }],
    ['mixed with an amount', { kind: 'mixed', extraSetAside: minorUnits(50000) }, { ...NONE, use: 'mixed', use_extra_set_aside: 50000 }],
    ['mixed without', { kind: 'mixed', extraSetAside: null }, { ...NONE, use: 'mixed' }],
    ['dedicated emergency', { kind: 'dedicated', purpose: { kind: 'emergency' } }, { ...NONE, use: 'dedicated', use_purpose: 'emergency' }],
    [
      'dedicated envelope',
      { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'g1' } },
      { ...NONE, use: 'dedicated', use_purpose: 'envelope', use_envelope_id: 'g1' },
    ],
    ['untouched', { kind: 'untouched' }, { ...NONE, use: 'untouched' }],
    ['not stated', null, NONE],
  ];
  it.each(cases)('maps %s and back', (_name, use, columns) => {
    expect(accountUsePatch(use)).toEqual(columns);
    expect(accountUseOfRow(columns as never)).toEqual(use);
  });

  it('reads a dedicated envelope with no id as unanswered', () => {
    expect(accountUseOfRow({ ...NONE, use: 'dedicated', use_purpose: 'envelope' })).toBeNull();
  });

  it('reads a dedicated row with no purpose as unanswered', () => {
    expect(accountUseOfRow({ ...NONE, use: 'dedicated' })).toBeNull();
  });
});

describe('emergencyLinkUse (D-04)', () => {
  const emergency: AccountUse = { kind: 'dedicated', purpose: { kind: 'emergency' } };
  it('leaves a dedicated-emergency account alone', () => {
    expect(emergencyLinkUse(emergency, false)).toBeNull();
  });
  it('leaves a mixed account alone', () => {
    expect(emergencyLinkUse({ kind: 'mixed', extraSetAside: minorUnits(100) }, false)).toBeNull();
  });
  it('makes an everyday account that also holds the fund mixed', () => {
    expect(emergencyLinkUse({ kind: 'everyday' }, true)).toEqual({ kind: 'mixed', extraSetAside: null });
  });
  it('makes an unstated account that only holds the fund dedicated emergency', () => {
    expect(emergencyLinkUse(null, false)).toEqual(emergency);
  });
  it('makes an untouched account that only holds the fund dedicated emergency', () => {
    expect(emergencyLinkUse({ kind: 'untouched' }, false)).toEqual(emergency);
  });
  it('makes a different dedicated purpose mixed when spending is also held', () => {
    expect(emergencyLinkUse({ kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'g' } }, true)).toEqual({
      kind: 'mixed',
      extraSetAside: null,
    });
  });
});
