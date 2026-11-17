import { MEMBER_COLOUR_NAMES, memberLabel } from '../memberLabel';

const base = { userId: 'u2', displayName: 'Sam', nameHidden: false, colourKey: 1, left: false };

describe('memberLabel', () => {
  it('names the viewer as you', () => {
    expect(memberLabel({ ...base, userId: 'u1' }, 'u1')).toEqual({ kind: 'you' });
  });

  it('names a deleted account as former', () => {
    expect(memberLabel({ ...base, userId: null }, 'u1')).toEqual({ kind: 'former' });
  });

  it('uses the colour name when the name is hidden', () => {
    expect(memberLabel({ ...base, nameHidden: true }, 'u1')).toEqual({
      kind: 'colour',
      text: 'Rust',
    });
  });

  it('uses the colour name when the display name is null or empty', () => {
    expect(memberLabel({ ...base, displayName: null, colourKey: 4 }, 'u1')).toEqual({
      kind: 'colour',
      text: 'Plum',
    });
    expect(memberLabel({ ...base, displayName: '  ', colourKey: 0 }, 'u1')).toEqual({
      kind: 'colour',
      text: 'Green',
    });
  });

  it('uses the shown name otherwise', () => {
    expect(memberLabel(base, 'u1')).toEqual({ kind: 'name', text: 'Sam' });
  });

  it('marks members who left', () => {
    expect(memberLabel({ ...base, left: true }, 'u1')).toEqual({
      kind: 'name',
      text: 'Sam',
      left: true,
    });
    expect(memberLabel({ ...base, nameHidden: true, left: true }, 'u1')).toEqual({
      kind: 'colour',
      text: 'Rust',
      left: true,
    });
  });

  it('exposes the colour names in UI-SPEC order', () => {
    expect(MEMBER_COLOUR_NAMES).toEqual(['Green', 'Rust', 'Slate', 'Ochre', 'Plum', 'Teal']);
  });
});
