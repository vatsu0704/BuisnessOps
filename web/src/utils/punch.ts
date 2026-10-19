import axios from 'axios';
import i18n from '@/i18n';
import { extractErrorMessage } from '@/api/client';
import { punchIn, punchOut } from '@/api/attendance';
import type { ApiErrorBody } from '@/api/errorMessages';
import type { AttendanceRecord } from '@/types/staffing';
import { getCurrentCoords } from '@/utils/location';

/** The refusals that mean "this punch needed to know where you are". */
const NEEDS_LOCATION = new Set(['PUNCH_LOCATION_REQUIRED', 'PUNCH_LOCATION_ALWAYS_REQUIRED']);

/**
 * Punch in or out from this browser — the Attendance page and Home's card.
 *
 * As in the app, the punch is attempted with whatever the browser could say about
 * where it is, and without coordinates when it could say nothing: a branch with no
 * geofence accepts that, and the server is the one that knows. What the app cannot
 * have is a browser that *blocked* location for this site — a person can fix that
 * in a second once told how, so when the refusal is about location and the browser
 * was the reason, the sentence says how to allow it.
 */
export async function punchNow(
  businessId: string,
  direction: 'in' | 'out'
): Promise<{ record: AttendanceRecord } | { error: string }> {
  const where = await getCurrentCoords();
  const coords = 'coords' in where ? where.coords : {};
  try {
    const record = direction === 'in' ? await punchIn(businessId, coords) : await punchOut(businessId, coords);
    return { record };
  } catch (err) {
    const message = extractErrorMessage(err);
    const code = axios.isAxiosError(err) ? (err.response?.data as ApiErrorBody | undefined)?.code : undefined;
    const blocked = 'failure' in where && where.failure === 'denied';
    return { error: blocked && code && NEEDS_LOCATION.has(code) ? `${message} ${i18n.t('web.location.denied')}` : message };
  }
}
