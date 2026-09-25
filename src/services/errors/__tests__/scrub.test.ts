// T-00-16-01 (STRIDE): financial data must never reach an error-tracking vendor. These are
// pure-function proofs that scrubMessage/scrubStackFrame redact amounts, digits, emails and
// quoted free text (which routinely carries payee/item names) before any event is sent.
import { scrubMessage, scrubStackFrame } from '../scrub';

describe('scrubMessage', () => {
  it('redacts a bare decimal amount and a double-quoted string (order: quotes before numbers)', () => {
    expect(scrubMessage('Invalid amount 123.45 for "Tesco Metro"')).toBe(
      'Invalid amount <n> for <str>'
    );
  });

  it('redacts an email address', () => {
    expect(scrubMessage('user jane@example.com failed')).toBe('user <email> failed');
  });

  it('redacts a single-quoted string', () => {
    expect(scrubMessage("failed for 'Acme Ltd'")).toBe('failed for <str>');
  });

  it('redacts runs of 4 or more digits', () => {
    expect(scrubMessage('FINCWIN_SPIKE_ERROR 12345')).toBe('FINCWIN_SPIKE_ERROR <n>');
  });

  it('redacts a leading-currency-symbol amount', () => {
    expect(scrubMessage('over budget by £12')).toBe('over budget by <n>');
  });

  it('redacts a trailing-currency-symbol amount with a thousands/decimal separator', () => {
    expect(scrubMessage('total 12,00 €')).toBe('total <n>');
  });

  it('redacts a dollar amount with cents', () => {
    expect(scrubMessage('charged $3.50 twice')).toBe('charged <n> twice');
  });

  it('leaves short bare integers alone (not a decimal, not a 4+ digit run)', () => {
    expect(scrubMessage('retry attempt 3 of 5')).toBe('retry attempt 3 of 5');
  });

  it('truncates anything after 200 characters', () => {
    const long = 'x'.repeat(250);
    const result = scrubMessage(long);
    expect(result).toHaveLength(200);
    expect(result).toBe('x'.repeat(200));
  });

  it('applies redaction before truncation, per the documented order', () => {
    // A quoted string starting right at the 200-char boundary: if truncation ran first, the
    // trailing quote would be cut off and the whole tail would survive unscrubbed.
    const prefix = 'a'.repeat(190);
    const message = `${prefix} "leaked payee name here" more text after`;
    const result = scrubMessage(message);
    expect(result).not.toMatch(/leaked payee name/);
  });
});

describe('scrubStackFrame', () => {
  it('keeps filename, function, line and column', () => {
    const frame = {
      filename: 'index.android.bundle',
      function: 'renderDecideVerdict',
      lineno: 42,
      colno: 7,
    };
    const scrubbed = scrubStackFrame(frame);
    expect(scrubbed.filename).toBe('index.android.bundle');
    expect(scrubbed.function).toBe('renderDecideVerdict');
    expect(scrubbed.lineno).toBe(42);
    expect(scrubbed.colno).toBe(7);
  });

  it('drops vars/locals', () => {
    const frame = {
      filename: 'index.android.bundle',
      lineno: 1,
      vars: { amount: 12345, payee: 'Tesco Metro' },
    };
    const scrubbed = scrubStackFrame(frame);
    expect(scrubbed).not.toHaveProperty('vars');
  });

  it('drops source-context lines, which can carry literal source code', () => {
    const frame = {
      filename: 'index.android.bundle',
      lineno: 1,
      context_line: 'const amount = 12345;',
      pre_context: ['const a = 1;'],
      post_context: ['const b = 2;'],
    };
    const scrubbed = scrubStackFrame(frame);
    expect(scrubbed).not.toHaveProperty('context_line');
    expect(scrubbed).not.toHaveProperty('pre_context');
    expect(scrubbed).not.toHaveProperty('post_context');
  });
});
