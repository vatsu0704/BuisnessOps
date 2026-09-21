import i18n from '@/i18n';

/**
 * Turns the API's error codes into a sentence in the reader's language.
 *
 * The backend does not translate: it has no reliable way to know which of the
 * four languages this device is set to (the choice lives on the device and can
 * differ from the account's `preferredLocale`). So it sends a stable code plus
 * whatever parameters the sentence needs, and the wording lives here, in
 * `en/hi/gu/mr.json`, beside every other string in the app.
 *
 * `scripts/check-error-parity.js` is what keeps this honest — it reads the
 * backend's catalog and fails if a code has no entry in `en.json`.
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
 * The cast is confined to this one function: everything else goes through it,
 * and the parity script — not the type system — is what proves the key exists.
 *
 * `defaultValue: ''` turns a missing key into a falsy result instead of
 * i18next's default of echoing the key back, which would print
 * "errors.api.BRANCH_NOT_FOUND" at someone.
 */
function translate(key: string, params: Record<string, unknown> = {}): string | null {
  const text = i18n.t(key as 'errors.unexpected', { ...params, defaultValue: '' });
  return text || null;
}

/** A field's label, falling back to the raw API name for fields with no label. */
function fieldLabel(field: string | null | undefined): string {
  if (!field) return '';
  return translate(`errors.field.${field}`) ?? field;
}

/**
 * One rejected row or field, in the reader's language. Exported because the
 * upload screen shows a list of per-row problems, which arrive as the same
 * kind of detail but are not an error response.
 */
export function translateDetail(detail: ApiErrorDetail): string | null {
  return translate(`errors.validation.${detail.code}`, {
    ...detail.params,
    field: fieldLabel(detail.field),
  });
}

/**
 * The message for an error body, or null when this build has no translation
 * for it — in which case the caller falls back to the server's own English
 * rather than to a generic "something went wrong", because a specific sentence
 * in the wrong language still beats a vague one in the right one.
 */
export function translateApiError(body: ApiErrorBody | undefined): string | null {
  if (!body) return null;

  if (body.code === 'VALIDATION_FAILED' && body.details?.length) {
    const lines = body.details.map(translateDetail).filter((line): line is string => !!line);
    // All or nothing: a half-translated list reads as broken. Falling back
    // gives the server's complete English list instead.
    if (lines.length === body.details.length) return lines.join('\n');
    return null;
  }

  if (body.code) return translate(`errors.api.${body.code}`, body.params ?? {});
  return null;
}
