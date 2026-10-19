import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IoReceiptOutline } from 'react-icons/io5';
import { useMonthCursor } from '@shared/hooks/useMonthCursor';
import { historyTotals } from '@shared/utils/supplyPayments';
import { payeeOf } from '@shared/utils/upiUri';
import { extractErrorMessage } from '@/api/client';
import { listPaymentHistory } from '@/api/supply';
import { SupplyPaymentPill } from '@/components/supply/SupplyPills';
import ChoiceTile from '@/components/ui/ChoiceTile';
import ErrorBanner from '@/components/ui/ErrorBanner';
import MonthCursor from '@/components/ui/MonthCursor';
import Pill from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import StatTile from '@/components/ui/StatTile';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import type { PaymentHistory as History, PaymentHistoryOrder } from '@/types/supply';
import { formatDate, formatTime, toISODate } from '@/utils/date';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import styles from './PaymentHistory.module.css';

type Model = 'ALL' | 'FOCO' | 'FM';

/**
 * What was paid, month by month — requirement 35, the app's `PaymentHistory`.
 *
 * Once accounts pays a FOCO order, or an FM branch's payment is confirmed, it
 * leaves the Payments lists; this is where it is found again. Each order says who
 * it was for, how much, how it stands, and its payments in order — who paid or
 * confirmed, when, and the reference typed with it. Read by this one tab, so it
 * stays local and is fetched again when the tab comes back into view.
 */
export default function PaymentHistory() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const [model, setModel] = useState<Model>('ALL');
  const [history, setHistory] = useState<(History & { model: Model }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!businessId) return;
    const request = ++latest.current;
    setError(null);
    try {
      const found = await listPaymentHistory(businessId, { month: monthKey, model: model === 'ALL' ? undefined : model });
      if (request === latest.current) setHistory({ ...found, model });
    } catch (err) {
      // The last month read stays beside the error.
      if (request === latest.current) setError(extractErrorMessage(err));
    }
  }, [businessId, monthKey, model]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(load, { onMount: false });

  const shown = history && history.month === monthKey && history.model === model ? history : null;
  const currency = shown?.orders[0]?.currency ?? 'INR';
  const totals = useMemo(() => historyTotals(shown?.totals ?? []), [shown]);
  const money = (value: number) => formatAmount(value, currency);

  return (
    <div className={styles.history}>
      <div className={styles.controls}>
        <MonthCursor label={label} onPrev={goPrev} onNext={goNext} canGoNext={canGoNext} />
        {/* Three choices, each the width the grid gives it — two short codes and "All". */}
        <fieldset className={styles.filters}>
          <legend className="visually-hidden">{t('payments.tabHistory')}</legend>
          <ChoiceTile
            name="payments-history-model"
            value="ALL"
            title={t('payments.historyAll')}
            selected={model === 'ALL'}
            onSelect={() => setModel('ALL')}
          />
          <ChoiceTile
            name="payments-history-model"
            value="FOCO"
            title="FOCO"
            caption={t('payments.historyFocoCaption')}
            selected={model === 'FOCO'}
            onSelect={() => setModel('FOCO')}
          />
          <ChoiceTile
            name="payments-history-model"
            value="FM"
            title="FM"
            caption={t('payments.historyFmCaption')}
            selected={model === 'FM'}
            onSelect={() => setModel('FM')}
          />
        </fieldset>
      </div>

      <div className={styles.tiles}>
        {model !== 'FM' ? (
          <StatTile
            label={t('payments.historyPaidByAccounts')}
            value={totals.foco.amount}
            caption={t('payments.historyOrders', { count: totals.foco.count })}
            formatValue={money}
          />
        ) : null}
        {model !== 'FOCO' ? (
          <StatTile
            label={t('payments.historyPaidByBranches')}
            value={totals.fm.amount}
            caption={t('payments.historyOrders', { count: totals.fm.count })}
            formatValue={money}
          />
        ) : null}
      </div>
      {totals.waiting.count > 0 ? (
        <p className={styles.waiting}>
          {t('payments.historyWaiting', { count: totals.waiting.count, amount: money(totals.waiting.amount) })}
        </p>
      ) : null}

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {!shown ? (
        error ? null : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )
      ) : shown.orders.length === 0 ? (
        <div className={styles.empty}>
          <IoReceiptOutline size={22} aria-hidden="true" />
          <p>{t('payments.historyEmpty', { month: label })}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {shown.orders.map((order) => (
            <li key={order.id}>
              <HistoryRow order={order} />
            </li>
          ))}
        </ul>
      )}
      {shown?.truncated ? <p className={styles.truncated}>{t('payments.historyTruncated')}</p> : null}
    </div>
  );
}

function HistoryRow({ order }: { order: PaymentHistoryOrder }) {
  const { t } = useTranslation();
  const payee = payeeOf(order);
  return (
    <Link to={pathTo('supplyOrderDetail', { supplyOrderId: order.id })} state={{ from: `${pathTo('payments')}?tab=history` }} className={styles.row}>
      <div className={styles.rowHead}>
        <div className={styles.rowText}>
          <p className={styles.rowTitle}>
            {t('supply.orderTitle', { number: order.orderNumber ?? '' })} · {order.branch?.name ?? ''}
          </p>
          <p className={styles.rowMeta}>{t('upiPay.payTo', { name: payee.name })}</p>
        </div>
        <p className={styles.rowAmount}>{formatAmountPrecise(Number(order.totalAmount), order.currency)}</p>
      </div>
      <div className={styles.pills}>
        <Pill label={order.operatingModel} tone="muted" />
        <SupplyPaymentPill status={order.paymentStatus} mode={order.paymentMode} />
      </div>
      <ul className={styles.events}>
        {order.events.map((event) => (
          <li key={event.id} className={styles.event}>
            <span className={styles.dot} aria-hidden="true" />
            <span>
              {t(`supplyEvent.${event.reasonCode}` as never)}
              {' · '}
              {event.actorMembership?.user?.name ?? t('paymentAccounts.someone')}
              {' · '}
              {formatDate(toISODate(new Date(event.createdAt)), t)} {formatTime(event.createdAt, t)}
              {event.note ? <span className={styles.reference}>{t('payments.reference', { reference: event.note })}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
