import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { IoPrintOutline, IoWalletOutline } from 'react-icons/io5';
import {
  EMPTY_QUEUE,
  addToCart,
  billOfSale,
  branchDayKey,
  cartTotal,
  mergeBills,
  nextTokenNumber,
  pendingSales,
  rejectedSales,
  setCartQuantity,
  unsyncedFigures,
  type DisplayBill,
} from '@shared/utils/counterQueue';
import { receiptForBill } from '@shared/utils/counterReceipt';
import { buildReceipt, previewReceipt } from '@shared/utils/receipt';
import { upiNote } from '@shared/utils/upiUri';
import { extractErrorMessage } from '@/api/client';
import { reopenCounterDay } from '@/api/counter';
import { usePastCounterDay } from '@/hooks/usePastCounterDay';
import BranchPicker from '@/components/branches/BranchPicker';
import AttentionCard from '@/components/counter/AttentionCard';
import BillDialog from '@/components/counter/BillDialog';
import BillList from '@/components/counter/BillList';
import CartPanel from '@/components/counter/CartPanel';
import ChargeDialog, { type ChargeDone } from '@/components/counter/ChargeDialog';
import ProductGrid from '@/components/counter/ProductGrid';
import SyncPill from '@/components/counter/SyncPill';
import ButtonLink from '@/components/ui/ButtonLink';
import DayCursor from '@/components/ui/DayCursor';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import StatTile from '@/components/ui/StatTile';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { useCounterStore } from '@/store/counterStore';
import { usePrinterStore } from '@/store/printerStore';
import { refreshToday } from '@/store/todayStore';
import { step } from '@/theme/motion';
import type {
  CartLine,
  CounterBranch,
  CounterDaySummary,
  CounterOrder,
  CounterPaymentMethod,
  CounterReceiptHeader,
  LocalSale,
} from '@/types/counter';
import type { BranchProduct } from '@/types/product';
import { confirm } from '@/utils/confirm';
import { kickCounterSync } from '@/utils/counterSync';
import { formatAmount } from '@/utils/format';
import { hasCapability, isReadOnly } from '@/utils/permissions';
import { printBytes, printerErrorKey } from '@/utils/printer';
import { printHtml } from '@/utils/printHtml';
import { receiptHtml } from '@/utils/receiptHtml';
import { randomUuid } from '@/utils/uuid';
import styles from './CounterPage.module.css';

// Stable empties for a store that belongs to another business, so a selector
// returning one does not re-render on every store change.
const NO_CONTEXTS: Record<string, CounterDaySummary> = {};
const NO_ORDERS: Record<string, CounterOrder[]> = {};
const NO_PRODUCTS: Record<string, BranchProduct[]> = {};

/**
 * The counter — requirements 1, 29, 30 and 31, the app's Counter screen.
 *
 * Laid out the way the job is done: today's figures at the top, the menu, today's
 * bills under it, and the bill being rung up beside the menu on a wide window, or
 * pinned to the foot of the page on a narrow one, with its Charge button.
 *
 * Ringing up happens in the browser — a click is instant, with or without a
 * connection. **Charge** takes the money (a UPI QR for the exact amount, or cash
 * with the change worked out); **Payment done** saves the bill in this browser
 * and gives it its token; the token prints; and only then is the bill sent —
 * straight away when there is a connection, later when there is not. Everything
 * the counter reads it keeps a copy of, so an offline counter still has its menu,
 * its QR and its numbers.
 */
export default function CounterPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const business = useAuthStore((s) => s.business);
  const { tradingBranches } = useBranches();
  const [searchParams, setSearchParams] = useSearchParams();

  // Every read is checked against the business the store belongs to, so a
  // business switch never shows the previous tenant's bills — and a bill can
  // never be saved into another business's queue (see `ready`).
  const loadedFor = useCounterStore((s) => s.loadedFor);
  const ready = !!businessId && loadedFor === businessId;
  const queue = useCounterStore((s) => (ready ? s.queue : EMPTY_QUEUE));
  const contexts = useCounterStore((s) => (ready ? s.contexts : NO_CONTEXTS));
  const orders = useCounterStore((s) => (ready ? s.orders : NO_ORDERS));
  const products = useCounterStore((s) => (ready ? s.products : NO_PRODUCTS));
  const cachedBranches = useCounterStore((s) => s.branches);
  const skewMs = useCounterStore((s) => s.skewMs);
  const syncState = useCounterStore((s) => s.syncState);
  const storeError = useCounterStore((s) => s.error);
  const storageUnavailable = useCounterStore((s) => s.storageUnavailable);
  const { load, refreshBranch, rememberBranches, completeSale, voidSale, voidServerOrder, retry, remove } =
    useCounterStore.getState();

  const printMethod = usePrinterStore((s) => s.method);
  const paperWidth = usePrinterStore((s) => s.paperWidth);
  const autoPrint = usePrinterStore((s) => s.autoPrint);

  // The branch list, from the server when it answers and from the counter's own
  // copy when it does not — an offline start has no other.
  const liveBranches = useMemo<CounterBranch[]>(
    () => tradingBranches.map(({ id, name, code }) => ({ id, name, code })),
    [tradingBranches]
  );
  const branches = liveBranches.length > 0 ? liveBranches : ready ? cachedBranches : [];
  useEffect(() => {
    if (ready && liveBranches.length > 0) rememberBranches(liveBranches);
  }, [ready, liveBranches, rememberBranches]);

  const requested = searchParams.get('branch');
  const branch = branches.find((b) => b.id === requested) ?? branches[0] ?? null;
  const branchId = branch?.id ?? null;

  const context = branchId ? contexts[branchId] : undefined;
  // Without a context — a branch never opened online — this computer's zone is
  // the best guess, and it is right for a computer standing in the shop.
  const utcOffset = context?.utcOffsetMinutes ?? -new Date().getTimezoneOffset();
  const dayKey = branchDayKey(Date.now(), skewMs, utcOffset);
  const sameDay = context?.todayKey === dayKey;
  const currency = context?.currency ?? business?.defaultCurrency ?? 'INR';

  // The day on screen. `null` means today — never a date string, because the
  // counter stays open all day and one snapshotted at 09:00 is wrong after
  // midnight. Kept in the address so reload and Back behave; absent is today.
  const cursor = searchParams.get('date');
  const shownDay = cursor && cursor < dayKey ? cursor : dayKey;
  const isToday = shownDay === dayKey;
  const past = usePastCounterDay(branchId, isToday ? null : shownDay);

  function showDay(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === dayKey) params.delete('date');
    else params.set('date', next);
    setSearchParams(params, { replace: true });
  }

  // A past day's server rows are the hook's; today's come from the store, which
  // is what keeps billing working with no connection.
  const dayOrders = useMemo(
    () =>
      isToday
        ? branchId
          ? (orders[branchId] ?? []).filter((order) => order.tokenDate.slice(0, 10) === dayKey)
          : []
        : past.orders,
    [isToday, orders, branchId, dayKey, past.orders]
  );
  // The queue is asked about the shown day either way: bills this device never
  // managed to send are still its own, and "what happened on Tuesday" has to
  // include them.
  const bills = useMemo(
    () => (branchId ? mergeBills(dayOrders, queue, branchId, shownDay) : []),
    [dayOrders, queue, branchId, shownDay]
  );
  const unsynced = useMemo(
    () => (branchId ? unsyncedFigures(dayOrders, queue, branchId, shownDay) : { count: 0, total: 0 }),
    [dayOrders, queue, branchId, shownDay]
  );
  const daySummary = isToday ? (sameDay ? context : undefined) : (past.summary ?? undefined);
  const salesToday = (daySummary ? Number(daySummary.totalAmount) : 0) + unsynced.total;
  const billsToday = (daySummary ? daySummary.orderCount : 0) + unsynced.count;
  // The server sends expenses only to somebody who may read them.
  const expensesToday = daySummary?.expenses ? Number(daySummary.expenses.totalAmount) : null;
  const pendingCount = pendingSales(queue).length;
  const attention = rejectedSales(queue);

  const menu = useMemo(
    () =>
      (branchId ? (products[branchId] ?? []) : []).filter(
        (product) => product.effectiveSellPrice !== null && product.effectiveIsActive
      ),
    [products, branchId]
  );

  const [cart, setCart] = useState<CartLine[]>([]);
  const onCart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of cart) {
      if (line.productId) counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.quantity);
    }
    return counts;
  }, [cart]);
  const [announcement, setAnnouncement] = useState('');

  const dayClosed = sameDay && !!context?.isClosed;
  const blockedReason = storageUnavailable
    ? t('web.counter.storageUnavailable')
    : isReadOnly(membership)
      ? t('web.counter.readOnly')
      : dayClosed
        ? t('counter.dayClosedNoBills')
        : null;

  const refresh = useCallback(async () => {
    if (!businessId) return;
    await load(businessId);
    if (branchId) await refreshBranch(branchId);
    void kickCounterSync();
  }, [businessId, branchId, load, refreshBranch]);

  useRefreshOnFocus(refresh, { onMount: false });
  // On opening, and whenever the branch changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function chooseBranch(id: string) {
    if (id === branchId) return;
    setSearchParams({ branch: id }, { replace: true });
    setCart([]);
  }

  function addProduct(product: BranchProduct) {
    setCart((lines) => {
      const next = addToCart(lines, {
        productId: product.id,
        name: product.name,
        sku: product.sku ?? null,
        unitPrice: Number(product.effectiveSellPrice),
      });
      const count = next.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
      setAnnouncement(t('web.counter.added', { name: product.name, count }));
      return next;
    });
  }

  // --- Taking a bill ---------------------------------------------------------

  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [chargeDone, setChargeDone] = useState<ChargeDone | null>(null);
  const [lastSale, setLastSale] = useState<LocalSale | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const header: CounterReceiptHeader = context?.receiptHeader ?? {
    businessName: business?.name ?? '',
    branchName: branch?.name ?? '',
    branchCode: branch?.code ?? '',
    addressLine: null,
    phone: null,
  };

  /** Print one bill the way this browser is set up to; what happened, for the token step. */
  async function printBill(bill: DisplayBill, copy: boolean): Promise<Pick<ChargeDone, 'print' | 'printError'>> {
    const receipt = receiptForBill(bill, { header, utcOffsetMinutes: utcOffset, currency, paperWidth, copy });
    try {
      if (printMethod === 'dialog') {
        await printHtml(receiptHtml(previewReceipt(receipt), paperWidth));
        return { print: 'dialog', printError: null };
      }
      await printBytes(buildReceipt(receipt));
      return { print: 'printed', printError: null };
    } catch (err) {
      return { print: 'failed', printError: t(printerErrorKey(err)) };
    }
  }

  async function printLastSale(copy: boolean) {
    if (!lastSale) return;
    setChargeDone((done) => (done ? { ...done, print: 'printing', printError: null } : done));
    const result = await printBill(billOfSale(lastSale), copy);
    setChargeDone((done) => (done ? { ...done, ...result } : done));
  }

  function openCharge() {
    if (!ready || cart.length === 0 || blockedReason) return;
    setChargeDone(null);
    setChargeOpen(true);
  }

  async function paymentDone(method: CounterPaymentMethod) {
    if (!ready || !branchId || cart.length === 0 || chargeBusy) return;
    setChargeBusy(true);
    setNotice(null);
    try {
      const day = branchDayKey(Date.now(), skewMs, utcOffset);
      const serverLast = context?.todayKey === day ? context.lastTokenNumber : 0;
      // The token is chosen inside the save, from what is stored — another tab
      // may have taken the next number a moment ago.
      const sale = await completeSale(
        {
          clientRef: randomUuid(),
          branchId,
          occurredAt: new Date(Date.now() + skewMs).toISOString(),
          dayKey: day,
          paymentMethod: method,
          lines: cart,
          currency,
        },
        serverLast
      );
      setCart([]);
      setLastSale(sale);

      const print: ChargeDone['print'] = !printMethod ? 'noPrinter' : autoPrint ? 'printing' : 'off';
      setChargeDone({ tokenNumber: sale.tokenNumber, print, printError: null });
      void kickCounterSync();
      void refreshToday();

      if (print === 'printing') {
        const result = await printBill(billOfSale(sale), false);
        setChargeDone((done) => (done ? { ...done, ...result } : done));
      }
    } catch {
      // Only the save can fail here; the sale did not happen, and no token was given.
      setNotice(t('web.counter.saveFailed'));
      setChargeOpen(false);
    } finally {
      setChargeBusy(false);
    }
  }

  function closeCharge() {
    setChargeOpen(false);
    setChargeDone(null);
    setLastSale(null);
  }

  // Ctrl/⌘ + Enter takes the payment for the bill on screen.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !chargeOpen) {
        event.preventDefault();
        openCharge();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- A bill already taken ----------------------------------------------------

  const [openBill, setOpenBill] = useState<DisplayBill | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  async function reprint(bill: DisplayBill) {
    setBillBusy(true);
    setBillError(null);
    const result = await printBill(bill, true);
    setBillBusy(false);
    if (result.print === 'failed') setBillError(result.printError);
  }

  async function voidBill(bill: DisplayBill) {
    const yes = await confirm({
      title: t('counter.voidTitle', { token: bill.tokenNumber }),
      body: t('counter.voidBody'),
      confirmLabel: t('counter.void'),
      cancelLabel: t('common.cancel'),
    });
    if (!yes || !branchId) return;
    setBillBusy(true);
    setBillError(null);
    try {
      const held = bill.clientRef ? queue.sales.some((sale) => sale.clientRef === bill.clientRef) : false;
      if (held && bill.clientRef) {
        // This browser's own bill: voided here and sent like any other change,
        // so it works offline too.
        await voidSale(bill.clientRef);
        void kickCounterSync();
      } else if (bill.orderId) {
        // A bill this browser never held — taken on another device. Only the
        // server can void it.
        await voidServerOrder(branchId, bill.orderId);
        void refreshBranch(branchId);
      }
      setOpenBill(null);
    } catch (err) {
      setBillError(extractErrorMessage(err));
    } finally {
      setBillBusy(false);
    }
  }

  // --- Bills the server refused ----------------------------------------------

  const [attentionBusy, setAttentionBusy] = useState<string | null>(null);

  async function sendAgain(sale: LocalSale) {
    setAttentionBusy(sale.clientRef);
    await retry(sale.clientRef);
    await kickCounterSync();
    setAttentionBusy(null);
  }

  async function reopenDay(sale: LocalSale) {
    if (!businessId) return;
    setAttentionBusy(sale.clientRef);
    setNotice(null);
    try {
      await reopenCounterDay(businessId, sale.branchId, sale.dayKey);
      await retry(sale.clientRef);
      await kickCounterSync();
    } catch (err) {
      setNotice(extractErrorMessage(err));
    } finally {
      setAttentionBusy(null);
    }
  }

  async function removeFromBrowser(sale: LocalSale) {
    const yes = await confirm({
      title: t('web.counter.removeTitle', { token: sale.tokenNumber }),
      body: t('counter.removeBody'),
      confirmLabel: t('counter.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (yes) await remove(sale.clientRef);
  }

  const total = cartTotal(cart);
  const shownError = notice ?? storeError;
  const canLogExpense = hasCapability(membership, 'expense:log') && !!branchId;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('counter.title')}
        actions={
          <div className={styles.headerActions}>
            {dayClosed ? <Pill label={t('counter.dayClosed')} tone="muted" /> : null}
            <ButtonLink to={pathTo('receiptPrinter')} title={t('printer.title')} icon={IoPrintOutline} variant="secondary" />
          </div>
        }
      />

      <SyncPill state={syncState} pendingCount={pendingCount} attentionCount={attention.length} />

      {branches.length > 1 ? (
        <Enter delay={step(1)}>
          <BranchPicker
            name="counter-branch"
            legend={t('counter.title')}
            hideLegend
            branches={branches}
            value={branchId}
            onChange={chooseBranch}
          />
        </Enter>
      ) : null}

      {shownError ? <ErrorBanner key={shownError} message={shownError} /> : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          {/* Today at the counter — and, for whoever may read them, what it spent. */}
          <Enter delay={step(2)} as="section" className={styles.today}>
            <DayCursor
              value={shownDay}
              today={dayKey}
              onChange={showDay}
              label={t('web.counter.whichDay')}
            />

            {/* A past day is a record, not a till: everything that would move
                money is hidden rather than disabled, because `paymentDone`
                computes the day from the clock, so a cart rung up while the
                screen says Tuesday would bill today. */}
            {!isToday ? <p className={styles.pastDay}>{t('web.counter.pastDay')}</p> : null}

            {past.state === 'offline' ? (
              <p className={styles.pastDay}>{t('web.counter.pastDayOffline', { date: shownDay })}</p>
            ) : past.state === 'failed' && past.error ? (
              <ErrorBanner message={past.error} />
            ) : null}

            {isToday || past.state === 'ready' ? (
              <div className={styles.stats}>
              <StatTile
                label={isToday ? t('counter.todaySales') : t('counter.daySales')}
                value={salesToday}
                accent="var(--color-success)"
                formatValue={(v) => formatAmount(v, currency)}
              />
              <StatTile label={isToday ? t('counter.todayBills') : t('counter.dayBills')} value={billsToday} />
              {expensesToday !== null ? (
                <StatTile
                  label={isToday ? t('counter.todayExpenses') : t('counter.dayExpenses')}
                  value={expensesToday}
                  accent="var(--color-error)"
                  formatValue={(v) => formatAmount(v, currency)}
                />
              ) : null}
              </div>
            ) : null}
            {isToday && canLogExpense ? (
              <Link to={`${pathTo('addExpense')}?branch=${encodeURIComponent(branchId ?? '')}`} className={styles.link}>
                <IoWalletOutline size={15} aria-hidden="true" />
                {t('counter.logExpense')}
              </Link>
            ) : null}
          </Enter>

          <AttentionCard
            sales={attention}
            canReopenDay={hasCapability(membership, 'counterOrder:closeDay')}
            busyRef={attentionBusy}
            onRetry={(sale) => void sendAgain(sale)}
            onReopenDay={(sale) => void reopenDay(sale)}
            onRemove={(sale) => void removeFromBrowser(sale)}
          />

          {isToday ? (
            <Enter delay={step(3)} as="section" className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('counter.tapToAdd')}</h2>
              {menu.length === 0 ? (
                <p className={styles.empty}>{context ? t('counter.noProducts') : t('web.counter.noMenuYet')}</p>
              ) : (
                <ProductGrid products={menu} onCart={onCart} currency={currency} onAdd={addProduct} />
              )}
            </Enter>
          ) : null}

          {bills.length === 0 && !isToday && past.state === 'ready' ? (
            <Enter delay={step(4)} as="section" className={styles.section}>
              <p className={styles.empty}>{t('web.counter.noBillsOn', { date: shownDay })}</p>
            </Enter>
          ) : null}

          {bills.length > 0 ? (
            <Enter delay={step(4)} as="section" className={styles.section}>
              <h2 className={styles.sectionTitle}>{isToday ? t('counter.todayBillsSection') : t('counter.dayBillsSection')}</h2>
              <BillList
                bills={bills}
                currency={currency}
                onOpen={(bill) => {
                  setBillError(null);
                  setOpenBill(bill);
                }}
              />
              {past.orders.length >= 200 ? (
                <p className={styles.hint}>{t('web.counter.cappedAt', { count: past.orders.length })}</p>
              ) : null}
              <p className={styles.hint}>{t('counter.billsHint')}</p>
            </Enter>
          ) : null}
        </div>

        {isToday ? (
          <aside className={styles.cart}>
            <CartPanel
              lines={cart}
              currency={currency}
              blockedReason={blockedReason}
              onChangeQuantity={(index, quantity) => setCart((lines) => setCartQuantity(lines, index, quantity))}
              onClear={() => setCart([])}
              onCharge={openCharge}
            />
          </aside>
        ) : null}
      </div>

      {/* Each tile added, said once for a screen reader. */}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <ChargeDialog
        open={chargeOpen}
        amount={total}
        currency={currency}
        payee={context?.payee ?? null}
        // The branch and the token the bill is about to get, so a payment in the
        // shop's bank app can be matched to its bill.
        noteLabel={upiNote(branch?.code, [
          branchId ? nextTokenNumber(queue, branchId, dayKey, sameDay ? context?.lastTokenNumber : 0) : null,
        ])}
        busy={chargeBusy}
        done={chargeDone}
        onPaid={(method) => void paymentDone(method)}
        onPrint={() => void printLastSale(chargeDone?.print === 'printed' || chargeDone?.print === 'dialog')}
        onClose={closeCharge}
      />

      <BillDialog
        bill={openBill}
        currency={currency}
        canVoid={hasCapability(membership, 'counterOrder:void')}
        canPrint={!!printMethod}
        busy={billBusy}
        error={billError}
        onPrint={(bill) => void reprint(bill)}
        onVoid={(bill) => void voidBill(bill)}
        onClose={() => setOpenBill(null)}
      />
    </div>
  );
}
