import i18n from '@/i18n';
import { explainPermissionDenied, explainPlanLocked } from '@/permissions/explain';

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
 * Render the parameters a sentence interpolates.
 *
 * A `role` arrives as the enum name the backend holds — `WAREHOUSE` — because
 * the backend cannot know which of the four languages to send, which is the
 * whole reason anything that varies travels as a parameter. Dropping it into
 * the sentence unchanged would print "WAREHOUSE works across every branch" in
 * the middle of a Gujarati paragraph, so it is translated here, in the one
 * place every error message already passes through.
 *
 * An unknown role — an app older than the server — falls back to the raw name
 * rather than blanking out, leaving a sentence that is ugly but still true.
 */
function renderParams(params: Record<string, unknown> = {}): Record<string, unknown> {
  const rendered = { ...params };
  if (typeof params.role === 'string') rendered.role = translate(`role.${params.role}`) ?? params.role;
  // A plan arrives as its code (`GROWTH`) for the same reason a role does
  // (requirement 28), and is named here the same way.
  if (typeof params.requiredPlan === 'string') {
    rendered.requiredPlan = translate(`plans.name.${params.requiredPlan}`) ?? params.requiredPlan;
  }
  return rendered;
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

  /**
   * Requirement 19 — a refusal says what the rule is.
   *
   * Every 403 from `requirePermission` arrives here carrying the capability it
   * wanted, and this app mirrors the capability matrix, so the sentence can name
   * the action and the roles that hold it: "Only Warehouse can accept, pack and
   * dispatch a supply order" instead of "Your role does not allow this."
   *
   * Done here rather than in each screen's catch, because there are dozens of
   * those and they all already call `extractErrorMessage`. One place, and every
   * refusal in the app explains itself — including ones written before this and
   * ones written after.
   *
   * It falls through to the plain translation when the capability is missing or
   * unknown to this build, so an app older than the server still says something
   * true.
   */
  if (body.code === 'PERMISSION_DENIED') {
    const explained = explainPermissionDenied(body.params?.capability);
    if (explained) return explained;
  }

  // Requirement 28: refused because of the business's plan rather than the
  // person's role — named the same way, with the plan that would allow it.
  if (body.code === 'PLAN_FEATURE_LOCKED') {
    const explained = explainPlanLocked(body.params);
    if (explained) return explained;
  }

  if (body.code === 'VALIDATION_FAILED' && body.details?.length) {
    const lines = body.details.map(translateDetail).filter((line): line is string => !!line);
    // All or nothing: a half-translated list reads as broken. Falling back
    // gives the server's complete English list instead.
    if (lines.length === body.details.length) return lines.join('\n');
    return null;
  }

  if (body.code) return translate(`errors.api.${body.code}`, renderParams(body.params));
  return null;
}

/**
 * Why the server refused one counter sale in a sync (requirement 30). The code
 * is either an API code (a closed day, a branch out of reach) or a validation
 * code naming the field, so both catalogues are tried. Falls back to the code
 * itself rather than to nothing — a person has to act on this.
 */
export function translateSaleRejection(code: string, params: Record<string, unknown> = {}): string {
  const asApi = translateApiError({ code, params });
  if (asApi) return asApi;
  const field = typeof params.field === 'string' ? params.field : null;
  return translateDetail({ code, field, params }) ?? code;
}
