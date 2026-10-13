import i18n from '@/i18n';

/**
 * Turns the API's error codes into a sentence in the reader's language.
 *
 * The backend never translates — it sends a stable code and the parameters the
 * sentence needs, and the wording lives in the shared locale files
 * (`errors.api.*`, `errors.validation.*`), so the web app reads exactly the
 * sentences the mobile app does.
 *
 * Not yet ported: the app's `explainPermissionDenied`, which turns a
 * PERMISSION_DENIED into "Only Warehouse can …". Until it is, a refusal reads
 * as the plain `errors.api.PERMISSION_DENIED` sentence.
 */

export interface ApiErrorDetail {
  code: string;
  field: string | null;
  params?: Record<string, unknown>;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  params?: Record<string, unknown>;
  /** English, rendered by the server. The fallback when a code is unknown here. */
  errors?: string[];
  details?: ApiErrorDetail[];
}

/**
 * t() is typed against en.json, so a key assembled at runtime has to be cast.
 * `defaultValue: ''` makes a missing key falsy instead of echoing the key back.
 */
function translate(key: string, params: Record<string, unknown> = {}): string | null {
  const text = i18n.t(key as 'errors.unexpected', { ...params, defaultValue: '' });
  return text || null;
}

function fieldLabel(field: string | null | undefined): string {
  if (!field) return '';
  return translate(`errors.field.${field}`) ?? field;
}

/** A `role` arrives as the enum name (WAREHOUSE) and is translated here. */
function renderParams(params: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof params.role !== 'string') return params;
  return { ...params, role: translate(`role.${params.role}`) ?? params.role };
}

export function translateDetail(detail: ApiErrorDetail): string | null {
  return translate(`errors.validation.${detail.code}`, { ...detail.params, field: fieldLabel(detail.field) });
}

/** The message for an error body, or null when this build has no wording for it. */
export function translateApiError(body: ApiErrorBody | undefined): string | null {
  if (!body) return null;

  if (body.code === 'VALIDATION_FAILED' && body.details?.length) {
    const lines = body.details.map(translateDetail).filter((line): line is string => !!line);
    // All or nothing: a half-translated list reads as broken.
    return lines.length === body.details.length ? lines.join('\n') : null;
  }

  if (body.code) return translate(`errors.api.${body.code}`, renderParams(body.params));
  return null;
}
