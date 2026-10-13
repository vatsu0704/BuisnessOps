import { describe, expect, it } from 'vitest';
import { translateApiError } from './errorMessages';

describe('translateApiError', () => {
  it('says what the rule is when a capability is refused (requirement 19)', () => {
    const sentence = translateApiError({ code: 'PERMISSION_DENIED', params: { capability: 'supplyOrder:fulfil' } });
    expect(sentence).toMatch(/Warehouse/);
    expect(sentence).not.toMatch(/PERMISSION_DENIED/);
  });

  it('falls back to the plain sentence for a capability this build does not know', () => {
    expect(translateApiError({ code: 'PERMISSION_DENIED', params: { capability: 'nothing:real' } })).toBeTruthy();
  });

  it('translates every row of a validation failure, or none of them', () => {
    const one = translateApiError({
      code: 'VALIDATION_FAILED',
      details: [{ code: 'FIELD_REQUIRED', field: 'name' }],
    });
    expect(one).toBeTruthy();
    expect(
      translateApiError({ code: 'VALIDATION_FAILED', details: [{ code: 'NO_SUCH_CODE', field: 'name' }] })
    ).toBeNull();
  });

  it('returns null for a code it has no wording for, so the server’s English is used', () => {
    expect(translateApiError({ code: 'FROM_A_NEWER_SERVER' })).toBeNull();
  });
});
