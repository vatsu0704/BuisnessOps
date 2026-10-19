import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  IoAdd,
  IoBusinessOutline,
  IoCashOutline,
  IoCubeOutline,
  IoPaperPlaneOutline,
  IoQrCodeOutline,
  IoRemove,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { groupBySupplier } from '@shared/utils/supplyGroups';
import { isUpiCurrency, supplierPayee, upiNote } from '@shared/utils/upiUri';
import { extractErrorMessage } from '@/api/client';
import { getSupplyOrder, placeSupplyOrder, updateSupplyOrderItem } from '@/api/supply';
import UpiPayCard from '@/components/payments/UpiPayCard';
import ChoiceTile from '@/components/ui/ChoiceTile';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { ChoosablePaymentMode, SupplyOrder, SupplyOrderItem } from '@/types/supply';
import { formatAmount } from '@/utils/format';
import styles from './SupplyCartPage.module.css';

/**
 * Review the order and send it — requirements 5, 24, 25 and 26, the app's Your
 * order screen.
 *
 * This is where quantities are decided, so each line has a real number field as
 * well as the steppers: raw material is ordered in twenties and halves.
 *
 * Lines are grouped by who supplies them, because that is how the server splits
 * the cart when it is placed — each supplier's share becomes its own order with
 * its own payee — so nothing about the result is a surprise.
 *
 * Who pays is the branch's, not the cashier's: a company-operated (FOCO) branch
 * is asked nothing, accounts pays once the goods arrive. A franchise (FM) branch
 * pays now, by scanning each supplier's QR before placing, or on delivery. Paying
 * is recorded, never collected — no gateway, nothing to type.
 */
export default function SupplyCartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const businessId = useBusinessId();
  const { supplyOrderId = '' } = useParams();

  const [order, setOrder] = useState<SupplyOrder | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ChoosablePaymentMode>('COD');
  // Which suppliers the cashier has said they paid, keyed like the groups.
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setError(null);
    try {
      setOrder(await getSupplyOrder(businessId, supplyOrderId));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, supplyOrderId]);

  useRefreshOnFocus(load);

  const groups = useMemo(() => groupBySupplier(order?.items ?? []), [order]);
  const isFoco = order?.branch?.operatingModel === 'FOCO';
  // Paying now needs a QR for every supplier. When one has no UPI ID yet, the
  // choice is not offered rather than offered and refused.
  const payNowPossible =
    !!order && isUpiCurrency(order.currency) && groups.every((group) => !!supplierPayee(group.vendor, order.business).upiId);
  const effectiveMode: ChoosablePaymentMode = payNowPossible ? mode : 'COD';

  async function setQuantity(itemId: string, quantity: number) {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      setOrder(await updateSupplyOrderItem(businessId, order.id, itemId, quantity));
      // A changed amount is a different payment: a "done" for a supplier whose
      // subtotal just moved no longer describes what was paid.
      setPaid(new Set());
      // Show what the server stored, not what was typed at it.
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  /** Commit a typed quantity; anything that is not a number goes back to what it was. */
  function commitDraft(line: SupplyOrderItem) {
    const typed = drafts[line.id];
    if (typed === undefined) return;
    const current = Number(line.quantity);
    const parsed = Number(typed.replace(',', '.'));
    if (typed.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setDrafts((prev) => ({ ...prev, [line.id]: String(current) }));
      return;
    }
    if (parsed === current) return;
    void setQuantity(line.id, parsed);
  }

  function markPaid(key: string, value: boolean) {
    setPaid((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function place() {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setIsPlacing(true);
    setError(null);
    try {
      const placed = await placeSupplyOrder(
        businessId,
        order.id,
        isFoco ? {} : effectiveMode === 'ONLINE' ? { paymentMode: 'ONLINE', paymentConfirmed: true } : { paymentMode: 'COD' }
      );
      // Replace: the cart is gone once it is an order, and going back to it would
      // show a page that no longer exists. A cart with two suppliers became two
      // orders, which the list shows together.
      navigate(
        placed.placedOrders.length > 1
          ? pathTo('supplyOrders')
          : pathTo('supplyOrderDetail', { supplyOrderId: placed.id }),
        { replace: true }
      );
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsBusy(false);
      setIsPlacing(false);
    }
  }

  const isEmpty = !order || order.items.length === 0;
  const canPlace = !isEmpty && (isFoco || effectiveMode === 'COD' || groups.every((group) => paid.has(group.key)));
  const backTo = order ? `${pathTo('supply')}?branch=${encodeURIComponent(order.branchId)}` : pathTo('supply');

  return (
    <div className={styles.page}>
      <PageHeader title={t('supply.cartTitle')} subtitle={order?.branch?.name} backTo={backTo} />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {!order ? (
        error ? null : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )
      ) : isEmpty ? (
        <Enter delay={step(1)} className={styles.empty}>
          <IoCubeOutline size={22} aria-hidden="true" />
          <p className={styles.emptyTitle}>{t('supply.cartEmpty')}</p>
          <p className={styles.emptyBody}>{t('supply.cartEmptyBody')}</p>
        </Enter>
      ) : (
        <>
          <div className={styles.layout}>
            <div className={styles.lines}>
              {groups.map((group, groupIndex) => (
                <Enter key={group.key} delay={step(Math.min(groupIndex + 1, 4))} className={styles.group}>
                  {/* Who it comes from heads every group, so a cart that will
                      become two orders reads as two before it is placed. */}
                  <h2 className={styles.supplier}>
                    {group.vendor ? (
                      <IoStorefrontOutline size={15} aria-hidden="true" />
                    ) : (
                      <IoCubeOutline size={15} aria-hidden="true" />
                    )}
                    <span>
                      {group.vendor ? t('supply.fromVendor', { name: group.vendor.name }) : t('supply.fromWarehouse')}
                    </span>
                  </h2>
                  <ul className={styles.list}>
                    {group.lines.map((line) => (
                      <CartLine
                        key={line.id}
                        line={line}
                        currency={order.currency}
                        draft={drafts[line.id]}
                        disabled={isBusy}
                        onDraft={(text) => setDrafts((prev) => ({ ...prev, [line.id]: text }))}
                        onCommit={() => commitDraft(line)}
                        onStep={(delta) => void setQuantity(line.id, Math.max(0, Number(line.quantity) + delta))}
                      />
                    ))}
                  </ul>
                  {groups.length > 1 ? (
                    <p className={styles.subtotal}>
                      <span>{t('supply.subtotal')}</span>
                      <strong>{formatAmount(group.subtotal, order.currency)}</strong>
                    </p>
                  ) : null}
                </Enter>
              ))}
            </div>

            <Enter delay={step(2)} className={styles.side}>
              {isFoco ? (
                <div className={styles.info}>
                  <IoBusinessOutline size={18} aria-hidden="true" />
                  <div>
                    <p className={styles.infoTitle}>{t('supply.accountsPaysTitle')}</p>
                    <p className={styles.infoBody}>{t('supply.accountsPaysBody')}</p>
                  </div>
                </div>
              ) : !payNowPossible ? (
                // Paying now needs every supplier's QR; when one is missing the
                // choice is not offered at all, and this says why.
                <div className={styles.info}>
                  <IoCashOutline size={18} aria-hidden="true" />
                  <div>
                    <p className={styles.infoTitle}>{t('supply.payCod')}</p>
                    <p className={styles.infoBody}>{t('supply.payNowUnavailable')}</p>
                  </div>
                </div>
              ) : (
                <fieldset className={styles.payment}>
                  <legend className={styles.paymentTitle}>{t('supply.paymentMode')}</legend>
                  <div className={styles.modes}>
                    <ChoiceTile
                      name="supply-payment-mode"
                      value="ONLINE"
                      title={t('supply.payNow')}
                      caption={t('supply.payNowHint')}
                      icon={IoQrCodeOutline}
                      selected={effectiveMode === 'ONLINE'}
                      onSelect={() => setMode('ONLINE')}
                    />
                    <ChoiceTile
                      name="supply-payment-mode"
                      value="COD"
                      title={t('supply.payCod')}
                      caption={t('supply.payCodHint')}
                      icon={IoCashOutline}
                      selected={effectiveMode === 'COD'}
                      onSelect={() => setMode('COD')}
                    />
                  </div>
                  {effectiveMode === 'ONLINE' ? (
                    <div className={styles.payCards}>
                      {groups.map((group) => (
                        <UpiPayCard
                          key={group.key}
                          payee={supplierPayee(group.vendor, order.business)}
                          amount={group.subtotal}
                          currency={order.currency}
                          note={upiNote(order.branch?.code, [])}
                          done={paid.has(group.key)}
                          onDone={() => markPaid(group.key, true)}
                          onUndo={() => markPaid(group.key, false)}
                        />
                      ))}
                    </div>
                  ) : null}
                </fieldset>
              )}
            </Enter>
          </div>

          {/* Stacked, not a row: the total on its own line and the button under
              it, so neither is squeezed by a translation that runs long. */}
          <div className={styles.tray}>
            <div className={styles.trayRow}>
              <span className={styles.trayLabel}>{t('supply.total')}</span>
              <span className={styles.trayTotal}>{formatAmount(Number(order.totalAmount), order.currency)}</span>
            </div>
            {groups.length > 1 ? <p className={styles.trayNote}>{t('supply.splitNote', { count: groups.length })}</p> : null}
            <PrimaryButton
              block
              title={t('supply.place')}
              icon={IoPaperPlaneOutline}
              loading={isPlacing}
              disabled={!canPlace || isBusy}
              onClick={() => void place()}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CartLine({
  line,
  currency,
  draft,
  disabled,
  onDraft,
  onCommit,
  onStep,
}: {
  line: SupplyOrderItem;
  currency: string;
  draft: string | undefined;
  disabled: boolean;
  onDraft: (text: string) => void;
  onCommit: () => void;
  onStep: (delta: number) => void;
}) {
  const { t } = useTranslation();
  const name = line.itemNameSnapshot;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
    }
  }

  return (
    <li className={styles.line}>
      <div className={styles.lineText}>
        <p className={styles.lineName}>{name}</p>
        <p className={styles.lineMeta}>
          {t('supply.perUnit', { price: formatAmount(Number(line.unitPrice), currency), unit: line.unitSnapshot })}
        </p>
      </div>
      <div className={styles.qty}>
        <button
          type="button"
          className={styles.stepper}
          onClick={() => onStep(-1)}
          disabled={disabled}
          aria-label={t('web.supply.less', { name })}
          title={t('web.supply.less', { name })}
        >
          <IoRemove size={15} aria-hidden="true" />
        </button>
        <input
          className={styles.qtyInput}
          type="text"
          inputMode="decimal"
          value={draft ?? String(Number(line.quantity))}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          onFocus={(event) => event.target.select()}
          aria-label={t('web.supply.quantityOf', { name, unit: line.unitSnapshot })}
        />
        <button
          type="button"
          className={styles.stepper}
          onClick={() => onStep(1)}
          disabled={disabled}
          aria-label={t('web.supply.more', { name })}
          title={t('web.supply.more', { name })}
        >
          <IoAdd size={15} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.lineTotal}>{formatAmount(Number(line.lineTotal), currency)}</p>
    </li>
  );
}
