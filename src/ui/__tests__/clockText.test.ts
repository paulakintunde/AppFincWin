import { clockText, dayPeriodWords } from '../clockText';

const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('clockText', () => {
  it('en-CA 12-hour with the right period', () => {
    expect(norm(clockText({ hours: 12, minutes: 39 }, 'en-CA'))).toMatch(/^12:39 p\.?m\.?$/i);
    expect(norm(clockText({ hours: 0, minutes: 39 }, 'en-CA'))).toMatch(/^12:39 a\.?m\.?$/i);
    expect(norm(clockText({ hours: 9, minutes: 5 }, 'en-CA'))).toMatch(/^9:05 a\.?m\.?$/i);
    expect(norm(clockText({ hours: 23, minutes: 39 }, 'en-CA'))).toMatch(/^11:39 p\.?m\.?$/i);
  });

  it('en-GB 24-hour has no period word', () => {
    expect(clockText({ hours: 12, minutes: 39 }, 'en-GB')).toBe('12:39');
    expect(clockText({ hours: 0, minutes: 39 }, 'en-GB')).toBe('00:39');
  });

  it('is right even when the runtime labels every 12 o clock time a.m.', () => {
    const faulty = (d: Date): Intl.DateTimeFormatPart[] => {
      const h = d.getUTCHours();
      return [
        { type: 'hour', value: String(h % 12 || 12) },
        { type: 'literal', value: ':' },
        { type: 'minute', value: '00' },
        { type: 'literal', value: ' ' },
        { type: 'dayPeriod', value: h === 9 || h === 12 ? 'a.m.' : 'p.m.' },
      ];
    };
    const words = dayPeriodWords('en-CA', faulty);
    expect(clockText({ hours: 12, minutes: 39 }, 'en-CA', words)).toBe('12:39 p.m.');
    expect(clockText({ hours: 0, minutes: 39 }, 'en-CA', words)).toBe('12:39 a.m.');
  });
});
