import { assertNever } from '../assertNever';

describe('assertNever', () => {
  it('throws with the JSON of the value and the supplied context', () => {
    expect(() => assertNever('unexpected' as never, 'status')).toThrow(
      'Unhandled status: "unexpected"'
    );
  });

  it('throws with the default context when none is given', () => {
    expect(() => assertNever(42 as never)).toThrow('Unhandled value: 42');
  });
});
