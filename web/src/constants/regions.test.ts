import { describe, expect, it } from 'vitest';
import { COUNTRIES, CURRENCIES, TIMEZONES } from '@shared/constants/regions';

/**
 * The data behind the country, currency and timezone pickers. These checks live
 * in the web because a browser has a real `Intl` to check timezone ids against
 * and Hermes does not — which is also why the data is bundled in the first place.
 */
describe('reference data', () => {
  it('leads with India, since that is who this is for', () => {
    expect(COUNTRIES[0].code).toBe('IN');
    expect(CURRENCIES[0].code).toBe('INR');
    expect(TIMEZONES[0].id).toBe('Asia/Kolkata');
  });

  it('has no duplicates in any list', () => {
    const unique = (values: string[]) => expect(new Set(values).size).toBe(values.length);
    unique(COUNTRIES.map((c) => c.code));
    unique(CURRENCIES.map((c) => c.code));
    unique(TIMEZONES.map((z) => z.id));
  });

  it('uses well-formed ISO codes', () => {
    for (const country of COUNTRIES) {
      expect(country.code, country.name).toMatch(/^[A-Z]{2}$/);
      expect(country.name.length, country.code).toBeGreaterThan(1);
    }
    for (const currency of CURRENCIES) {
      expect(currency.code, currency.name).toMatch(/^[A-Z]{3}$/);
      expect(currency.symbol.length, currency.code).toBeGreaterThan(0);
    }
  });

  it('covers every country, not a chosen few', () => {
    // Once the field stops being free text, a missing country is a business
    // that cannot be created and no way round it from inside the app.
    expect(COUNTRIES.length).toBeGreaterThan(200);
    for (const code of ['IN', 'AE', 'GB', 'US', 'SG', 'AU', 'ZA', 'PY', 'TV']) {
      expect(COUNTRIES.some((c) => c.code === code), code).toBe(true);
    }
  });

  /**
   * The one that matters. The backend resolves these with the tzdb and falls
   * back to UTC without a word when it cannot, which files a shop's evening
   * sales on the wrong day — a reporting bug with no visible cause.
   */
  it('names only timezones the tzdb actually knows', () => {
    for (const zone of TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone.id }), zone.id).not.toThrow();
    }
  });

  it('gives India the aliases somebody would really type', () => {
    const india = COUNTRIES[0];
    expect(india.aliases).toContain('Bharat');
    expect(india.aliases).toContain('ભારત');
  });
});
