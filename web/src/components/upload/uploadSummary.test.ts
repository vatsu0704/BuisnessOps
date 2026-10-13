import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { UploadResult } from '@/api/dataSource';
import { summariseUpload } from './uploadSummary';

const result = (patch: Partial<UploadResult>): UploadResult => ({
  recordsProcessed: 10,
  recordsValid: 10,
  recordsFailed: 0,
  transactionsCreated: 6,
  transactionsUpdated: 0,
  errors: [],
  ...patch,
});

describe('summariseUpload', () => {
  it('calls an untouched template "nothing to import", not a clean import of nothing', () => {
    const summary = summariseUpload(result({ recordsProcessed: 0, recordsValid: 0, examplesSkipped: 4 }), i18n.t);
    expect(summary.onlyExamples).toBe(true);
    expect(summary.clean).toBe(false);
    expect(summary.notes).toEqual([]);
  });

  it('says how dates were read and how many samples were left out', () => {
    const summary = summariseUpload(result({ examplesSkipped: 4, dateOrder: 'DAY_FIRST' }), i18n.t);
    expect(summary.clean).toBe(true);
    expect(summary.notes).toEqual(['4 example rows were left out.', expect.stringContaining('day first')]);
  });

  it("says a skipped row in the reader's words, and keeps the server's English for a code it does not know", () => {
    const summary = summariseUpload(
      result({
        recordsFailed: 2,
        errors: ['Row 4: quantity must be more than 0', 'Row 9: something new'],
        errorDetails: [
          { code: 'ROW_QUANTITY_NOT_POSITIVE', field: 'quantity', params: { row: 4 } },
          { code: 'ROW_SOMETHING_NEW', field: null, params: { row: 9 } },
        ],
      }),
      i18n.t
    );
    expect(summary.clean).toBe(false);
    expect(summary.rowErrors).toEqual(['Row 4: quantity must be more than 0', 'Row 9: something new']);
  });
});
