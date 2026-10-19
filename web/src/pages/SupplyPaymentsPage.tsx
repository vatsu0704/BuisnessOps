import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  IoArrowBack,
  IoCheckbox,
  IoCheckboxOutline,
  IoCheckmarkCircle,
  IoCubeOutline,
  IoQrCodeOutline,
  IoShieldCheckmarkOutline,
  IoSquareOutline,
  IoStorefrontOutline,
  IoTimeOutline,
  IoWalletOutline,
} from 'react-icons/io5';
import { groupByPayee, readyIds, toggleSelection, type PayeeSection } from '@shared/utils/supplyPayments';
import { payeeOf, upiNote } from '@shared/utils/upiUri';
import { extractErrorMessage } from '@/api/client';
import { settleSupplyPayments, verifySupplyPayment } from '@/api/supply';
import PaymentHistory from '@/components/payments/PaymentHistory';
import UpiPayCard from '@/components/payments/UpiPayCard';
import { SupplyStatusPill } from '@/components/supply/SupplyPills';
import Button from '@/components/ui/Button';
import ChoiceTile from '@/components/ui/ChoiceTile';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useSupplyPayments } from '@/hooks/useSupplyPayments';
import { pathTo } from '@/routes/paths';
import { refreshSupplyPayments } from '@/store/supplyPaymentStore';
import { step } from '@/theme/motion';
import type { SupplyPaymentOrder } from '@/types/supply';
import { confirm } from '@/utils/confirm';
import { cx } from '@/utils/cx';
import { formatDate, toISODate } from '@/utils/date';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import styles from './SupplyPaymentsPage.module.css';

type Tab = 'pay' | 'confirm' | 'history';
const TABS: Tab[] = ['pay', 'confirm', 'history'];

/**
 * Paying for supply orders, confirming payments arrived, and what was paid —
 * requirements 26, 27 and 35, the app's Payments screen. The tab is in the
 * address (`?tab=`), so Home's cards and the Payment history tile open the right
 * one; only the tabs this person may use are offered.
 *
 * **To pay** (`supplyPayment:settle`): every company-operated branch's unpaid
 * order, grouped by who it is owed to, because one payment pays one UPI ID. An
 * order still on its way is listed, dimmed; only a delivered one can be ticked,
 * and ticking somebody else's starts a new selection. Paying shows one QR for the
 * whole selection, and "Payment done" asks first — it cannot be undone.
 *
 * **To confirm** (`supplyPayment:verify`): payments franchise branches sent the
 * warehouse. "Received" asks, then confirms; "Not received" lives on the order.
 *
 * **History** (`supplyPayment:viewHistory`): month by month.
 */
export default function SupplyPaymentsPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const [searchParams, setSearchParams] = useSearchParams();

  const { canSettle, canVerify, due, toConfirm, ready, readyTotal, isLoading, error, refresh } = useSupplyPayments();
  // The desk confirms payments but does not keep the books.
  const canViewHistory = hasCapability(membership, 'supplyPayment:viewHistory');
  const allowed: Record<Tab, boolean> = { pay: canSettle, confirm: canVerify, history: canViewHistory };
  const requested = searchParams.get('tab') as Tab | null;
  const tab: Tab =
    requested && TABS.includes(requested) && allowed[requested] ? requested : (TABS.find((key) => allowed[key]) ?? 'history');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPaying, setIsPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useRefreshOnFocus(refresh, { onMount: false });

  const sections = useMemo(() => groupByPayee(due, t('supply.fromWarehouse')), [due, t]);
  // What is ticked and still payable: an order paid elsewhere since drops out on refresh.
  const selection = useMemo(() => ready.filter((order) => selected.has(order.id)), [ready, selected]);
  const selectionTotal = selection.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const selectionCurrency = selection[0]?.currency ?? 'INR';

  function chooseTab(next: Tab) {
    setSearchParams({ tab: next }, { replace: true });
    setActionError(null);
  }

  function toggle(order: SupplyPaymentOrder) {
    setNotice(null);
    // One payee per payment: ticking somebody else's order starts over.
    setSelected((prev) => toggleSelection(prev, selection, order));
  }

  function selectAllReady(section: PayeeSection) {
    setNotice(null);
    setSelected(readyIds(section));
  }

  async function settle() {
    if (!businessId || selection.length === 0 || busy) return;
    const ok = await confirm({
      title: t('payments.confirmPaidTitle'),
      body: t('payments.confirmPaidBody', {
        amount: formatAmountPrecise(selectionTotal, selectionCurrency),
        payee: payeeOf(selection[0]).name,
        count: selection.length,
      }),
      confirmLabel: t('upiPay.done'),
      cancelLabel: t('common.cancel'),
      destructive: false,
    });
    if (!ok) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await settleSupplyPayments(businessId, { supplyOrderIds: selection.map((order) => order.id) });
      setNotice(
        t('payments.paidNotice', { amount: formatAmountPrecise(result.totalAmount, result.currency), count: result.count })
      );
      setSelected(new Set());
      setIsPaying(false);
      await refreshSupplyPayments();
    } catch (err) {
      setActionError(extractErrorMessage(err));
      // Whatever refused it has probably changed underneath — paid elsewhere,
      // cancelled — so show the lists as they are now.
      await refreshSupplyPayments();
    } finally {
      setBusy(false);
    }
  }

  async function markReceived(order: SupplyPaymentOrder) {
    if (!businessId || busy) return;
    const ok = await confirm({
      title: t('payments.confirmReceivedTitle'),
      body: t('payments.confirmReceivedBody', {
        amount: formatAmount(Number(order.totalAmount), order.currency),
        branch: order.branch?.name ?? '',
        number: order.orderNumber ?? '',
      }),
      confirmLabel: t('supply.markVerified'),
      cancelLabel: t('common.cancel'),
      destructive: false,
    });
    if (!ok) return;
    setBusy(true);
    setActionError(null);
    try {
      await verifySupplyPayment(businessId, order.id, 'VERIFIED');
      await refreshSupplyPayments();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shownError = actionError ?? error;
  const orderLink = (order: SupplyPaymentOrder) => ({
    to: pathTo('supplyOrderDetail', { supplyOrderId: order.id }),
    state: { from: `${pathTo('payments')}?tab=${tab}` },
  });

  // --- Paying: one QR for the whole selection --------------------------------
  if (isPaying && selection.length > 0) {
    return (
      <div className={styles.page}>
        <PageHeader
          title={t('payments.payTitle')}
          subtitle={t('payments.payCount', { count: selection.length })}
          actions={<Button title={t('web.common.back')} icon={IoArrowBack} onClick={() => setIsPaying(false)} />}
        />
        {shownError ? <ErrorBanner key={shownError} message={shownError} /> : null}
        <div className={styles.paying}>
          <Enter delay={step(1)}>
            <UpiPayCard
              payee={payeeOf(selection[0])}
              amount={selectionTotal}
              currency={selectionCurrency}
              note={upiNote(null, selection.map((order) => order.orderNumber))}
              doneBusy={busy}
              onDone={() => void settle()}
            />
          </Enter>
          <Enter delay={step(2)} className={styles.covers}>
            <h2 className={styles.sectionLabel}>{t('payments.covers')}</h2>
            <ul className={styles.coverList}>
              {selection.map((order) => (
                <li key={order.id} className={styles.coverRow}>
                  <span className={styles.coverText}>
                    {t('supply.orderTitle', { number: order.orderNumber ?? '' })} · {order.branch?.name ?? ''}
                  </span>
                  <span className={styles.coverAmount}>{formatAmount(Number(order.totalAmount), order.currency)}</span>
                </li>
              ))}
            </ul>
          </Enter>
        </div>
      </div>
    );
  }

  const subtitle =
    tab === 'pay' ? t('payments.paySubtitle') : tab === 'confirm' ? t('payments.confirmSubtitle') : t('payments.historySubtitle');
  const showTabs = TABS.filter((key) => allowed[key]).length > 1;

  return (
    <div className={styles.page}>
      <PageHeader title={t('payments.title')} subtitle={subtitle} />

      {showTabs ? (
        <Enter delay={step(1)}>
          <fieldset className={styles.tabs}>
            <legend className="visually-hidden">{t('payments.title')}</legend>
            {canSettle ? (
              <ChoiceTile
                name="payments-tab"
                value="pay"
                title={t('payments.tabPay')}
                caption={t('payments.readyCount', { count: ready.length })}
                icon={IoWalletOutline}
                selected={tab === 'pay'}
                onSelect={() => chooseTab('pay')}
              />
            ) : null}
            {canVerify ? (
              <ChoiceTile
                name="payments-tab"
                value="confirm"
                title={t('payments.tabConfirm')}
                caption={t('payments.waitingCount', { count: toConfirm.length })}
                icon={IoShieldCheckmarkOutline}
                selected={tab === 'confirm'}
                onSelect={() => chooseTab('confirm')}
              />
            ) : null}
            {canViewHistory ? (
              <ChoiceTile
                name="payments-tab"
                value="history"
                title={t('payments.tabHistory')}
                icon={IoTimeOutline}
                selected={tab === 'history'}
                onSelect={() => chooseTab('history')}
              />
            ) : null}
          </fieldset>
        </Enter>
      ) : null}

      {tab !== 'history' && shownError ? <ErrorBanner key={shownError} message={shownError} /> : null}
      {tab === 'pay' && notice ? (
        <p key={notice} className={styles.notice} role="status">
          <IoCheckmarkCircle size={16} aria-hidden="true" />
          <span>{notice}</span>
        </p>
      ) : null}

      {tab === 'history' ? (
        <Enter delay={step(2)}>
          <PaymentHistory />
        </Enter>
      ) : isLoading && (tab === 'pay' ? due.length === 0 : toConfirm.length === 0) ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : tab === 'pay' ? (
        sections.length === 0 ? (
          <Enter delay={step(2)} className={styles.empty}>
            <IoWalletOutline size={22} aria-hidden="true" />
            <p className={styles.emptyTitle}>{t('payments.nothingToPay')}</p>
            <p className={styles.emptyBody}>{t('payments.nothingToPayBody')}</p>
          </Enter>
        ) : (
          <>
            {sections.map((section, index) => (
              <Enter key={section.key} delay={step(Math.min(index + 2, 5))} className={styles.section}>
                {/* Stacked: the payee, the figure and the button each grow with the language. */}
                <div className={styles.sectionHeader}>
                  <h2 className={styles.payee}>
                    {section.isVendor ? (
                      <IoStorefrontOutline size={16} aria-hidden="true" />
                    ) : (
                      <IoCubeOutline size={16} aria-hidden="true" />
                    )}
                    <span>{section.payeeName}</span>
                  </h2>
                  <p className={styles.readyLine}>
                    {section.readyCount > 0
                      ? t('payments.readyLine', {
                          amount: formatAmount(section.readyTotal, section.currency),
                          count: section.readyCount,
                        })
                      : t('payments.nothingReady')}
                  </p>
                  {section.readyCount > 0 ? (
                    <button type="button" className={styles.selectAll} onClick={() => selectAllReady(section)}>
                      <IoCheckboxOutline size={16} aria-hidden="true" />
                      <span>{t('payments.selectAllReady')}</span>
                    </button>
                  ) : null}
                </div>
                <ul className={styles.rows}>
                  {section.data.map((order) => {
                    const isReady = order.status === 'DELIVERED';
                    const isSelected = selected.has(order.id);
                    const title = `${t('supply.orderTitle', { number: order.orderNumber ?? '' })} · ${order.branch?.name ?? ''}`;
                    return (
                      <li key={order.id} className={cx(styles.row, !isReady && styles.waiting, isSelected && styles.selected)}>
                        {/* Two targets: the tick chooses what to pay, the rest opens the order. */}
                        <label className={cx(styles.tick, !isReady && styles.tickOff)}>
                          <input
                            type="checkbox"
                            className="visually-hidden"
                            checked={isSelected}
                            disabled={!isReady}
                            onChange={() => toggle(order)}
                            aria-label={title}
                          />
                          {!isReady ? (
                            <IoTimeOutline size={22} aria-hidden="true" />
                          ) : isSelected ? (
                            <IoCheckbox size={22} aria-hidden="true" />
                          ) : (
                            <IoSquareOutline size={22} aria-hidden="true" />
                          )}
                        </label>
                        <Link {...orderLink(order)} className={styles.rowBody}>
                          <span className={styles.rowTitle}>{title}</span>
                          <span className={styles.rowAmount}>{formatAmount(Number(order.totalAmount), order.currency)}</span>
                          <span className={styles.rowMeta}>
                            {isReady
                              ? t('payments.deliveredOn', {
                                  date: formatDate(toISODate(new Date(order.deliveredAt ?? order.createdAt)), t),
                                })
                              : t('payments.onTheWay')}
                          </span>
                          <span className={styles.rowPills}>
                            <SupplyStatusPill status={order.status} fromVendor={!!order.vendorId} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Enter>
            ))}

            {selection.length > 0 ? (
              // Stacked like the cart's: the count over the figure, the button beside or under.
              <div className={styles.tray}>
                <div className={styles.trayText}>
                  <p className={styles.trayLabel}>{t('payments.selectedCount', { count: selection.length })}</p>
                  <p className={styles.trayTotal}>{formatAmountPrecise(selectionTotal, selectionCurrency)}</p>
                </div>
                <PrimaryButton
                  title={t('payments.paySelected')}
                  icon={IoQrCodeOutline}
                  className={styles.trayButton}
                  onClick={() => {
                    setActionError(null);
                    setIsPaying(true);
                  }}
                />
              </div>
            ) : ready.length > 0 ? (
              <p className={styles.hint}>
                {t('payments.readyTotalHint', { amount: formatAmount(readyTotal, ready[0].currency) })}
              </p>
            ) : null}
          </>
        )
      ) : toConfirm.length === 0 ? (
        <Enter delay={step(2)} className={styles.empty}>
          <IoShieldCheckmarkOutline size={22} aria-hidden="true" />
          <p className={styles.emptyTitle}>{t('payments.nothingToConfirm')}</p>
          <p className={styles.emptyBody}>{t('payments.nothingToConfirmBody')}</p>
        </Enter>
      ) : (
        <Enter delay={step(2)}>
          <ul className={styles.confirmList}>
            {toConfirm.map((order) => (
              <li key={order.id} className={styles.confirmCard}>
                <Link {...orderLink(order)} className={styles.confirmBody}>
                  <span className={styles.rowTitle}>
                    {t('supply.orderTitle', { number: order.orderNumber ?? '' })} · {order.branch?.name ?? ''}
                  </span>
                  <span className={styles.rowAmount}>{formatAmount(Number(order.totalAmount), order.currency)}</span>
                  <span className={styles.rowMeta}>
                    {order.paymentMode === 'COD' ? t('payments.sentOnDelivery') : t('payments.sentBeforeOrdering')}
                  </span>
                </Link>
                <Button
                  title={t('supply.markVerified')}
                  icon={IoShieldCheckmarkOutline}
                  className={styles.received}
                  disabled={busy}
                  onClick={() => void markReceived(order)}
                />
              </li>
            ))}
          </ul>
        </Enter>
      )}
    </div>
  );
}
