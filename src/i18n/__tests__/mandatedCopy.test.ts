/**
 * IN-C01: the open.er-api attribution text and URL exist in the client (src/i18n) and in
 * the Deno shared FX library (supabase/functions/_shared/fx/openErApi.ts, used by
 * resolve-rate), which cannot share a module. This pins every copy to the
 * server's canonical constants so an edit to one cannot drift silently.
 */
import {
  OPEN_ER_API_ATTRIBUTION,
  OPEN_ER_API_ATTRIBUTION_URL,
} from '../../../supabase/functions/_shared/fx/openErApi';
import en from '../locales/en';
import { EXCHANGE_RATE_API_ATTRIBUTION, EXCHANGE_RATE_API_URL } from '../mandatedCopy';

describe('open.er-api mandated attribution (D-13)', () => {
  it('client constants equal the canonical strings in supabase/functions/_shared/fx/openErApi.ts', () => {
    expect(EXCHANGE_RATE_API_ATTRIBUTION).toBe(OPEN_ER_API_ATTRIBUTION);
    expect(EXCHANGE_RATE_API_URL).toBe(OPEN_ER_API_ATTRIBUTION_URL);
  });

  it('both en catalogue keys carry the verbatim text', () => {
    expect(en.money.rate.attribution).toBe(OPEN_ER_API_ATTRIBUTION);
    expect(en.credits.exchangeRateApi).toBe(OPEN_ER_API_ATTRIBUTION);
  });
});
