import type { TFunction } from 'i18next';
import { GRACE_DAYS, type Plan } from '../permissions';
import type { SubscriptionView } from '../types/user';
import { formatDateLong, toISODate } from '../utils/date';

/**
 * Requirement 28 — how a subscription is described to a person, shared by the
 * app's Plan screen and Home banner and the web's (which reads this file through
 * `@shared`, so it imports only relative paths and `i18next`).
 *
 * What each plan UNLOCKS is decided by the mirrored matrix (`plans` in
 * `permissions/matrix.json`); this is only the human summary of it, a handful of
 * lines per plan rather than forty capability names. A Record over every plan,
 * so a plan added to the mirror fails `tsc` here until somebody says what it
 * includes.
 */
export type PlanItem =
  | 'counter'
  | 'products'
  | 'expenses'
  | 'people'
  | 'exports'
  | 'branchFigures'
  | 'warehouse'
  | 'delivery'
  | 'netProfit'
  | 'foco'
  | 'vendors'
  | 'accountant';

/** What each plan adds over the one below it, in the order the screen lists them. */
export const PLAN_ITEMS: Record<Plan, readonly PlanItem[]> = {
  STARTER: ['counter', 'products', 'expenses', 'people', 'exports', 'branchFigures'],
  GROWTH: ['warehouse', 'delivery', 'netProfit'],
  FRANCHISE: ['foco', 'vendors', 'accountant'],
};

/** "12 November 2026", on the device's own calendar, from an instant the API sent. */
export function formatInstantDate(iso: string, t: TFunction): string {
  return formatDateLong(toISODate(new Date(iso)), t);
}

/**
 * "Free trial", "Paid", "Ended", "Cancelled".
 *
 * Where the plan stands outranks what was last decided about it: a paid plan
 * whose period has run out is not "Paid" any more, and a label saying so beside
 * a sentence saying it ended would contradict itself.
 */
export function subscriptionStatusLabel(subscription: SubscriptionView, t: TFunction): string {
  const { state, status } = subscription;
  if (status === 'CANCELLED') return t('plans.status.CANCELLED');
  if (state === 'GRACE' || state === 'READ_ONLY') return t('plans.status.ENDED');
  return t(`plans.status.${status ?? 'NONE'}` as 'plans.status.NONE');
}

/** The one sentence that says where the subscription stands and until when. */
export function subscriptionStateLine(subscription: SubscriptionView, t: TFunction): string {
  const { state, status, endsAt, graceEndsAt } = subscription;
  if (state === 'READ_ONLY') return t('plans.state.readOnly');
  if (state === 'GRACE' && endsAt && graceEndsAt) {
    return t('plans.state.grace', {
      date: formatInstantDate(endsAt, t),
      graceDate: formatInstantDate(graceEndsAt, t),
    });
  }
  if (!endsAt) return t('plans.state.openEnded');
  const date = formatInstantDate(endsAt, t);
  return status === 'TRIALING' ? t('plans.state.trialUntil', { date }) : t('plans.state.paidUntil', { date });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type PlanBannerKind = 'trialEnding' | 'grace' | 'readOnly';

/**
 * Which banner, if any, Home shows about the plan.
 *
 * - READ_ONLY is shown to everyone: it is why their next save will be refused,
 *   and a cashier who meets that refusal mid-service should already know why.
 * - GRACE and a trial in its last GRACE_DAYS are the owner's alone (`isOwner` is
 *   `billing:manage`): nobody else can do anything about them, and a banner
 *   nobody can act on is noise on every screen open.
 */
export function planBanner(
  subscription: SubscriptionView | undefined,
  isOwner: boolean,
  now: Date = new Date()
): { kind: PlanBannerKind; endsAt: string | null; graceEndsAt: string | null } | null {
  if (!subscription) return null;
  const { state, status, endsAt, graceEndsAt } = subscription;
  if (state === 'READ_ONLY') return { kind: 'readOnly', endsAt, graceEndsAt };
  if (!isOwner) return null;
  if (state === 'GRACE') return { kind: 'grace', endsAt, graceEndsAt };
  if (status === 'TRIALING' && endsAt && new Date(endsAt).getTime() - now.getTime() <= GRACE_DAYS * DAY_MS) {
    return { kind: 'trialEnding', endsAt, graceEndsAt };
  }
  return null;
}

/** The banner's sentence. */
export function planBannerText(
  banner: { kind: PlanBannerKind; endsAt: string | null; graceEndsAt: string | null },
  t: TFunction
): string {
  if (banner.kind === 'readOnly') return t('plans.banner.readOnly');
  const date = banner.endsAt ? formatInstantDate(banner.endsAt, t) : '';
  if (banner.kind === 'trialEnding') return t('plans.banner.trialEnding', { date });
  const graceDate = banner.graceEndsAt ? formatInstantDate(banner.graceEndsAt, t) : '';
  return t('plans.banner.grace', { date, graceDate });
}
