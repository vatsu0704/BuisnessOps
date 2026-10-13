import { explainPermissionDenied, explainPlanLocked } from '@shared/permissions/explain';
import i18n from '@/i18n';

/**
 * Turns the API's error codes into a sentence in the reader's language.
 *
 * The backend never translates — it sends a stable code and the parameters the
 * sentence needs, and the wording lives in the shared locale files
 * (`errors.api.*`, `errors.validation.*`), so the web app reads exactly the
 * sentences the mobile app does.
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

/** A `role` (WAREHOUSE) or a plan (GROWTH) arrives as its enum name and is translated here. */
function renderParams(params: Record<string, unknown> = {}): Record<string, unknown> {
  const rendered = { ...params };
  if (typeof params.role === 'string') rendered.role = translate(`role.${params.role}`) ?? params.role;
  if (typeof params.requiredPlan === 'string') {
    rendered.requiredPlan = translate(`plans.name.${params.requiredPlan}`) ?? params.requiredPlan;
  }
  return rendered;
}

export function translateDetail(detail: ApiErrorDetail): string | null {
  return translate(`errors.validation.${detail.code}`, { ...detail.params, field: fieldLabel(detail.field) });
}

/** The message for an error body, or null when this build has no wording for it. */
export function translateApiError(body: ApiErrorBody | undefined): string | null {
  if (!body) return null;

  // Requirement 19: a refusal names the action and the roles that hold it —
  // "Only Warehouse can accept, pack and dispatch a supply order" — built from the
  // shared matrix. Falls through to the plain sentence for a capability this
  // build does not know.
  if (body.code === 'PERMISSION_DENIED') {
    const explained = explainPermissionDenied(body.params?.capability);
    if (explained) return explained;
  }

  // Requirement 28: refused because of the business's plan, not the role —
  // "To add a vendor, this business needs the Franchise plan."
  if (body.code === 'PLAN_FEATURE_LOCKED') {
    const explained = explainPlanLocked(body.params);
    if (explained) return explained;
  }

  if (body.code === 'VALIDATION_FAILED' && body.details?.length) {
    const lines = body.details.map(translateDetail).filter((line): line is string => !!line);
    // All or nothing: a half-translated list reads as broken.
    return lines.length === body.details.length ? lines.join('\n') : null;
  }

  if (body.code) return translate(`errors.api.${body.code}`, renderParams(body.params));
  return null;
}
