import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { IconType } from 'react-icons';
import { IoChevronForward, IoTimeOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import ChipGroup from '@/components/ui/ChipGroup';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { SupplyOrder, SupplyOrderStatus } from '@/types/supply';
import { formatAmount } from '@/utils/format';
import { SupplyPaymentPill, SupplyStatusPill } from './SupplyPills';
import styles from './SupplyOrderList.module.css';

/**
 * The branch's tracking list, the warehouse desk and the delivery queue are one
 * page fetching different rows — the app's `SupplyOrderList`. Three copies would
 * not stay one: the next change to how an order reads would land in whichever
 * copy somebody had open. What differs is passed in: which orders, what the
 * empty state says, and whether the branch is worth naming.
 *
 * A row is a card on a narrow window and one line of a table on a wide one, the
 * same element either way.
 */
export default function SupplyOrderList({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  emptyIcon: EmptyIcon,
  showBranch = false,
  statusFilters,
  fetchOrders,
}: {
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyBody: string;
  emptyIcon: IconType;
  /** The desk and the delivery queue span branches, so they say which one. */
  showBranch?: boolean;
  /** Offered as chips above the list, in the address as `?status=`. Omit for a list with nothing to narrow. */
  statusFilters?: SupplyOrderStatus[];
  fetchOrders: (businessId: string, status?: SupplyOrderStatus) => Promise<SupplyOrder[]>;
}) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('status');
  const status = statusFilters?.find((value) => value === requested);

  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  // What the rows on screen were fetched for, so a change of filter or business
  // never shows one list under another's chip.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const key = `${businessId}:${status ?? ''}`;

  const load = useCallback(async () => {
    if (!businessId) return;
    const request = ++latest.current;
    setError(null);
    try {
      const found = await fetchOrders(businessId, status);
      if (request !== latest.current) return;
      setOrders(found);
      setShownFor(`${businessId}:${status ?? ''}`);
    } catch (err) {
      // A failed refresh keeps the rows it had and says why beside them.
      if (request === latest.current) setError(extractErrorMessage(err));
    } finally {
      if (request === latest.current) setIsLoading(false);
    }
  }, [businessId, status, fetchOrders]);

  // On mount and whenever the filter changes; again when the tab comes back into view.
  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(load, { onMount: false });

  const rows = shownFor === key ? orders : [];
  const waiting = shownFor !== key && !error;

  return (
    <div className={styles.page}>
      <PageHeader title={title} subtitle={subtitle} />

      {statusFilters ? (
        <Enter delay={step(1)}>
          {/* A wrap, not a row: the statuses will never fit side by side on a
              phone, and they run longer in Gujarati than in English. */}
          <ChipGroup
            name="supply-status"
            label={t('supply.ordersTitle')}
            hideLabel
            options={[
              { value: 'ALL', label: t('common.all') },
              ...statusFilters.map((value) => ({ value, label: t(`supplyStatus.${value}`) })),
            ]}
            value={status ?? 'ALL'}
            onChange={(value) =>
              setSearchParams(value === 'ALL' ? {} : { status: value }, { replace: true })
            }
          />
        </Enter>
      ) : null}

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {waiting || (isLoading && rows.length === 0 && !error) ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : rows.length === 0 ? (
        error ? null : (
          <Enter delay={step(2)} className={styles.empty}>
            <EmptyIcon size={22} aria-hidden="true" />
            <p className={styles.emptyTitle}>{emptyTitle}</p>
            <p className={styles.emptyBody}>{emptyBody}</p>
          </Enter>
        )
      ) : (
        <Enter delay={step(2)}>
          <ul className={styles.list}>
            {rows.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} showBranch={showBranch} />
              </li>
            ))}
          </ul>
        </Enter>
      )}
    </div>
  );
}

/** One order — opens its cart while it is still a cart, its page once placed. */
function OrderRow({ order, showBranch }: { order: SupplyOrder; showBranch: boolean }) {
  const { t } = useTranslation();
  // The order page's back link returns here — the desk with its filter, or the
  // branch's list — rather than guessing which list it was opened from.
  const { pathname, search } = useLocation();
  // The most recent delay, which is what somebody waiting wants to see.
  const lastDelay = [...order.events].reverse().find((event) => event.type === 'DELAY');
  const to =
    order.status === 'DRAFT'
      ? pathTo('supplyCart', { supplyOrderId: order.id })
      : pathTo('supplyOrderDetail', { supplyOrderId: order.id });
  const meta = [
    showBranch && order.branch ? order.branch.name : null,
    // Who it comes from, when that is not the warehouse — a cart with two
    // suppliers became two orders, and this is how they differ.
    order.vendor ? t('supply.fromVendor', { name: order.vendor.name }) : null,
    t('supply.reviewCount', { count: order.items.length }),
  ].filter(Boolean);

  return (
    <Link to={to} state={{ from: pathname + search }} className={styles.row}>
      <div className={styles.main}>
        <p className={styles.title}>
          {order.orderNumber === null ? t('supply.draftTitle') : t('supply.orderTitle', { number: order.orderNumber })}
        </p>
        <p className={styles.meta}>{meta.join(' · ')}</p>
      </div>

      <div className={styles.pills}>
        <SupplyStatusPill status={order.status} fromVendor={!!order.vendorId} />
        {order.paymentMode ? <SupplyPaymentPill status={order.paymentStatus} mode={order.paymentMode} /> : null}
      </div>

      {order.deliveryAgentMembership || lastDelay ? (
        <div className={styles.extra}>
          {/* Who is carrying it, so the desk answers "where has 214 got to?"
              without opening every row. */}
          {order.deliveryAgentMembership ? (
            <p className={styles.agent}>
              {t('supply.assignedTo', { name: order.deliveryAgentMembership.user?.name ?? t('supply.assignUnnamed') })}
            </p>
          ) : null}
          {lastDelay ? (
            <p className={styles.delay}>
              <IoTimeOutline size={14} aria-hidden="true" />
              <span>
                {t('supply.delayBadge', { minutes: lastDelay.delayMinutes ?? 0 })}
                {lastDelay.reasonCode ? ` · ${t(`supplyDelay.${lastDelay.reasonCode}` as never)}` : ''}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <p className={styles.amount}>{formatAmount(Number(order.totalAmount), order.currency)}</p>
      <IoChevronForward className={styles.chevron} size={18} aria-hidden="true" />
    </Link>
  );
}
