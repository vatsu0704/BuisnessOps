import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';
import type { IconType } from 'react-icons';
import {
  IoBanOutline,
  IoBicycleOutline,
  IoCashOutline,
  IoCheckmark,
  IoCheckmarkDone,
  IoCloseCircleOutline,
  IoCubeOutline,
  IoLogoWhatsapp,
  IoPaperPlaneOutline,
  IoQrCodeOutline,
  IoShieldCheckmarkOutline,
  IoTimeOutline,
  IoTrashOutline,
  IoChatbubbleEllipsesOutline,
} from 'react-icons/io5';
import {
  DELAY_REASONS,
  PROMISE_CHOICES,
  supplyOrderActions,
  vendorOrderLines,
  type SupplyPrimaryAction,
} from '@shared/utils/supplyActions';
import { payeeOf, upiNote } from '@shared/utils/upiUri';
import { whatsAppUrl } from '@shared/utils/whatsappNumber';
import { extractErrorMessage } from '@/api/client';
import {
  acceptSupplyOrder,
  assignSupplyOrder,
  cancelSupplyOrder,
  deliverSupplyOrder,
  dispatchSupplyOrder,
  getSupplyOrder,
  packSupplyOrder,
  paySupplyOrder,
  postSupplyDelay,
  receiveSupplyOrder,
  rejectSupplyOrder,
  verifySupplyPayment,
} from '@/api/supply';
import UpiPayCard from '@/components/payments/UpiPayCard';
import AgentPicker from '@/components/supply/AgentPicker';
import DeliveryAddress from '@/components/supply/DeliveryAddress';
import panelStyles from '@/components/supply/Panel.module.css';
import { SupplyPaymentPill, SupplyStatusPill } from '@/components/supply/SupplyPills';
import SupplyTimeline from '@/components/supply/SupplyTimeline';
import Button from '@/components/ui/Button';
import buttonStyles from '@/components/ui/Button.module.css';
import Card from '@/components/ui/Card';
import ChipGroup from '@/components/ui/ChipGroup';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import FormTextArea from '@/components/ui/FormTextArea';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { refreshSupplyPayments } from '@/store/supplyPaymentStore';
import { step } from '@/theme/motion';
import type { SupplyDelayReason, SupplyOrder } from '@/types/supply';
import { confirm } from '@/utils/confirm';
import { cx } from '@/utils/cx';
import { formatTime } from '@/utils/date';
import { formatAmount } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import styles from './SupplyOrderDetailPage.module.css';

/**
 * `dispatch` and `assign` share one picker; `collect` is the agent taking a
 * pay-on-delivery order's money; `receive` is the branch saying a vendor's goods
 * came and whether the vendor was paid; `pay` is the branch paying afterwards.
 */
type Panel = 'none' | 'delay' | 'reject' | 'accept' | 'dispatch' | 'assign' | 'collect' | 'receive' | 'pay';

const PRIMARY_ICONS: Record<SupplyPrimaryAction, IconType> = {
  accept: IoCheckmark,
  pack: IoCubeOutline,
  dispatch: IoBicycleOutline,
  deliver: IoCheckmarkDone,
  collect: IoCheckmarkDone,
  sendToVendor: IoPaperPlaneOutline,
  receive: IoCheckmarkDone,
  receiveAsk: IoCheckmarkDone,
  pay: IoQrCodeOutline,
};

/** The question a primary button opens, for the ones that ask before they act. */
const PRIMARY_OPENS: Partial<Record<SupplyPrimaryAction, Panel>> = {
  accept: 'accept',
  dispatch: 'dispatch',
  collect: 'collect',
  receiveAsk: 'receive',
  pay: 'pay',
};

/**
 * One supply order, and everything anyone may do to it — the app's order screen.
 *
 * One page for every role: the order is the same object, and what differs is
 * which actions are offered. Those rules are shared with the app
 * (`utils/supplyActions.ts`) and come from the capability matrix, so a button
 * that renders is a button whose request will succeed.
 *
 * The questions an action needs — when it will be ready, who is taking it, how
 * the money was taken, why it is late — open in the page under the buttons,
 * rather than in a dialog, so the order stays in view while they are answered.
 */
export default function SupplyOrderDetailPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { supplyOrderId = '' } = useParams();
  const location = useLocation();

  const can = {
    fulfil: hasCapability(membership, 'supplyOrder:fulfil'),
    deliver: hasCapability(membership, 'supplyOrder:deliver'),
    delay: hasCapability(membership, 'supplyOrder:delay'),
    order: hasCapability(membership, 'supplyOrder:create'),
    receive: hasCapability(membership, 'supplyOrder:receive'),
    verify: hasCapability(membership, 'supplyPayment:verify'),
  };

  const [order, setOrder] = useState<SupplyOrder | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  // Inside the collect and receive questions: whether the QR has been brought up.
  // Cash is the common answer, so the code waits to be asked for.
  const [showQr, setShowQr] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('30');
  const [reason, setReason] = useState<SupplyDelayReason>('TRAFFIC');
  const [note, setNote] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const found = await getSupplyOrder(businessId, supplyOrderId);
      setOrder(found);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, supplyOrderId]);

  useRefreshOnFocus(load);

  // Back to the list it was opened from; otherwise to the list that is this
  // person's job — the desk, the deliveries, or the branch's orders.
  const from = (location.state as { from?: string } | null)?.from;
  const backTo =
    from ?? (can.fulfil ? pathTo('desk') : can.deliver ? pathTo('deliveries') : pathTo('supplyOrders'));

  function openPanel(next: Panel) {
    setShowQr(false);
    setPanel(panel === next ? 'none' : next);
  }

  /**
   * Every action is the same shape: call, replace the order, close the question.
   * The payment lists are refreshed after each, because several of these move an
   * order onto or off them; for somebody who never loaded them it is a no-op.
   */
  async function run(action: (businessId: string, orderId: string) => Promise<SupplyOrder>) {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      setOrder(await action(businessId, order.id));
      setPanel('none');
      setShowQr(false);
      setNote('');
      void refreshSupplyPayments();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  if (!order) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('common.loading')} backTo={backTo} />
        {error ? (
          <ErrorBanner message={error} />
        ) : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )}
      </div>
    );
  }

  const fromVendor = !!order.vendorId;
  const amount = formatAmount(Number(order.totalAmount), order.currency);
  const payee = payeeOf(order);
  const qrNote = upiNote(order.branch?.code, [order.orderNumber]);
  const actions = supplyOrderActions(order, can);

  const PRIMARY: Record<SupplyPrimaryAction, { label: string; onClick: () => void }> = {
    accept: { label: t('supply.accept'), onClick: () => openPanel('accept') },
    pack: { label: t('supply.pack'), onClick: () => void run(packSupplyOrder) },
    // Dispatch asks who is taking it rather than going out blind; the freest
    // agent is chosen already, so the common case is one more click.
    dispatch: { label: t('supply.dispatch'), onClick: () => openPanel('dispatch') },
    deliver: { label: t('supply.deliver'), onClick: () => void run((b, id) => deliverSupplyOrder(b, id)) },
    collect: { label: t('supply.deliver'), onClick: () => openPanel('collect') },
    sendToVendor: { label: t('supply.markSentToVendor'), onClick: () => void run((b, id) => acceptSupplyOrder(b, id)) },
    receive: { label: t('supply.markReceived'), onClick: () => void run((b, id) => receiveSupplyOrder(b, id)) },
    receiveAsk: { label: t('supply.markReceived'), onClick: () => openPanel('receive') },
    pay: { label: t('supply.payAmount', { amount }), onClick: () => openPanel('pay') },
  };
  const primary = actions.primary ? { ...PRIMARY[actions.primary], icon: PRIMARY_ICONS[actions.primary] } : null;
  const primaryOpens = actions.primary ? PRIMARY_OPENS[actions.primary] : undefined;

  /** Withdrawing cannot be undone — placing it again means rebuilding the cart — so it asks. */
  async function askThenCancel() {
    const ok = await confirm({
      title: t('supply.cancelTitle'),
      body: t('supply.cancelBody'),
      confirmLabel: t('supply.cancel'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) void run((b, id) => cancelSupplyOrder(b, id));
  }

  /** "Not received" sends the branch back to pay again, so it asks; "Received" does not. */
  async function askThenMarkNotReceived() {
    const ok = await confirm({
      title: t('supply.notReceivedTitle'),
      body: t('supply.notReceivedBody', { amount, branch: order?.branch?.name ?? '' }),
      confirmLabel: t('supply.markFailed'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) void run((b, id) => verifySupplyPayment(b, id, 'FAILED'));
  }

  // The order as a message to the vendor, in the reader's language: which
  // branch, what, how much. Their own number is the address.
  const whatsappHref =
    actions.whatsapp && order.vendor?.phone
      ? whatsAppUrl(
          order.vendor.phone,
          t('supply.whatsappMessage', {
            number: order.orderNumber ?? '',
            branch: order.branch?.name ?? '',
            address: order.branch?.addressLine ?? order.branch?.city ?? '',
            lines: vendorOrderLines(order),
            total: amount,
          })
        )
      : null;

  /** Dispatch carries the agent with the move; a reassignment only changes who. */
  function submitAgent(deliveryAgentMembershipId: string | null) {
    if (panel === 'dispatch') {
      void run((b, id) => dispatchSupplyOrder(b, id, deliveryAgentMembershipId ?? undefined));
    } else if (deliveryAgentMembershipId) {
      void run((b, id) => assignSupplyOrder(b, id, deliveryAgentMembershipId));
    }
  }

  const hasSecondary =
    actions.whatsapp || actions.reassign || actions.delay || actions.verify || actions.reject || actions.cancel;

  // --- The pieces, placed into two columns on a wide page and one on a narrow one.

  const summary = (
    <Card>
      <div className={styles.pills}>
        <SupplyStatusPill status={order.status} fromVendor={fromVendor} />
        {order.paymentMode ? <SupplyPaymentPill status={order.paymentStatus} mode={order.paymentMode} /> : null}
        {order.promisedAt ? (
          <Pill tone="warning" icon={IoTimeOutline} label={t('supply.promisedAt', { time: formatTime(order.promisedAt, t) })} />
        ) : null}
      </div>
      <p className={styles.supplier}>
        {order.vendor ? t('supply.fromVendor', { name: order.vendor.name }) : t('supply.fromWarehouse')}
      </p>
      {order.paymentReference ? <p className={styles.reference}>{order.paymentReference}</p> : null}
      {order.placedByMembership?.user?.name ? (
        <p className={styles.byline}>{t('supply.placedBy', { name: order.placedByMembership.user.name })}</p>
      ) : null}
      {order.deliveryAgentMembership ? (
        <p className={styles.byline}>
          {t('supply.assignedTo', { name: order.deliveryAgentMembership.user?.name ?? t('supply.assignUnnamed') })}
        </p>
      ) : null}
    </Card>
  );

  const actionArea =
    primary || hasSecondary ? (
      <Card className={styles.actions}>
        {primary ? (
          <PrimaryButton
            block
            title={primary.label}
            icon={primary.icon}
            loading={isBusy && panel === 'none'}
            disabled={isBusy}
            aria-expanded={primaryOpens ? panel === primaryOpens : undefined}
            onClick={primary.onClick}
          />
        ) : null}
        {hasSecondary ? (
          <div className={styles.secondary}>
            {actions.whatsapp ? (
              whatsappHref ? (
                <a className={cx(buttonStyles.button, buttonStyles.secondary, styles.whatsapp)} href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <IoLogoWhatsapp size={17} aria-hidden="true" />
                  <span>{t('supply.sendOnWhatsApp')}</span>
                </a>
              ) : (
                <Button
                  title={t('supply.sendOnWhatsApp')}
                  icon={IoLogoWhatsapp}
                  onClick={() => setError(t('supply.whatsappUnavailable'))}
                />
              )
            ) : null}
            {actions.reassign ? (
              <Button
                title={t('supply.reassign')}
                icon={IoBicycleOutline}
                aria-expanded={panel === 'assign'}
                onClick={() => openPanel('assign')}
              />
            ) : null}
            {actions.delay ? (
              <Button
                title={t('supply.postDelay')}
                icon={IoTimeOutline}
                aria-expanded={panel === 'delay'}
                onClick={() => openPanel('delay')}
              />
            ) : null}
            {actions.verify ? (
              <Button
                title={t('supply.markVerified')}
                icon={IoShieldCheckmarkOutline}
                className={styles.good}
                disabled={isBusy}
                onClick={() => void run((b, id) => verifySupplyPayment(b, id, 'VERIFIED'))}
              />
            ) : null}
            {actions.verifyFailed ? (
              <Button
                variant="danger"
                title={t('supply.markFailed')}
                icon={IoCloseCircleOutline}
                disabled={isBusy}
                onClick={() => void askThenMarkNotReceived()}
              />
            ) : null}
            {actions.reject ? (
              <Button
                variant="danger"
                title={t('supply.reject')}
                icon={IoBanOutline}
                aria-expanded={panel === 'reject'}
                onClick={() => openPanel('reject')}
              />
            ) : null}
            {actions.cancel ? (
              <Button
                variant="danger"
                title={t('supply.cancel')}
                icon={IoTrashOutline}
                disabled={isBusy}
                onClick={() => void askThenCancel()}
              />
            ) : null}
          </div>
        ) : null}
      </Card>
    ) : null;

  let question: ReactNode = null;
  if (panel === 'accept') {
    question = (
      <div className={panelStyles.panel}>
        <p className={panelStyles.title}>{t('supply.promiseQuestion')}</p>
        <div className={styles.promises}>
          {PROMISE_CHOICES.map((minutes) => (
            <Button
              key={minutes}
              title={t('supply.delayBadge', { minutes })}
              disabled={isBusy}
              onClick={() =>
                void run((b, id) => acceptSupplyOrder(b, id, new Date(Date.now() + minutes * 60_000).toISOString()))
              }
            />
          ))}
        </div>
        <button type="button" className={panelStyles.skip} disabled={isBusy} onClick={() => void run((b, id) => acceptSupplyOrder(b, id))}>
          {t('supply.promiseSkip')}
        </button>
      </div>
    );
  } else if (panel === 'collect') {
    // Taking the money at the counter (requirements 22 and 26): cash, or the
    // warehouse's QR shown here for the cashier to scan with their own phone.
    question = (
      <div className={panelStyles.panel}>
        <p className={panelStyles.title}>{t('supply.collectTitle')}</p>
        <p className={panelStyles.body}>{t('supply.collectQuestion', { amount, branch: order.branch?.name ?? '' })}</p>
        <p className={panelStyles.hint}>{t('supply.cashHint')}</p>
        <div className={panelStyles.stack}>
          <PrimaryButton
            block
            title={t('supply.cashYes')}
            icon={IoCashOutline}
            loading={isBusy && !showQr}
            disabled={isBusy}
            onClick={() => void run((b, id) => deliverSupplyOrder(b, id, 'CASH'))}
          />
          <Button
            block
            title={showQr ? t('supply.hideQr') : t('supply.showQr')}
            icon={IoQrCodeOutline}
            aria-expanded={showQr}
            onClick={() => setShowQr(!showQr)}
          />
        </div>
        {showQr ? (
          <UpiPayCard
            payee={payee}
            amount={Number(order.totalAmount)}
            currency={order.currency}
            note={qrNote}
            doneLabel={t('supply.upiTakenDeliver')}
            doneBusy={isBusy}
            onDone={() => void run((b, id) => deliverSupplyOrder(b, id, 'UPI'))}
          />
        ) : null}
        <button type="button" className={panelStyles.skip} onClick={() => setPanel('none')}>
          {t('supply.cashNo')}
        </button>
      </div>
    );
  } else if (panel === 'receive') {
    // A vendor's goods arrived at a franchise branch that pays on delivery: the
    // vendor's own person is there, so the branch says whether it paid them.
    question = (
      <div className={panelStyles.panel}>
        <p className={panelStyles.title}>{t('supply.receiveTitle')}</p>
        <p className={panelStyles.body}>{t('supply.vendorPaidQuestion', { amount, vendor: order.vendor?.name ?? '' })}</p>
        <div className={panelStyles.stack}>
          <PrimaryButton
            block
            title={t('supply.paidVendorCash')}
            icon={IoCashOutline}
            loading={isBusy && !showQr}
            disabled={isBusy}
            onClick={() => void run((b, id) => receiveSupplyOrder(b, id, 'CASH'))}
          />
          <Button
            block
            title={showQr ? t('supply.hideQr') : t('supply.payVendorUpi')}
            icon={IoQrCodeOutline}
            aria-expanded={showQr}
            onClick={() => setShowQr(!showQr)}
          />
        </div>
        {showQr ? (
          <UpiPayCard
            payee={payee}
            amount={Number(order.totalAmount)}
            currency={order.currency}
            note={qrNote}
            doneLabel={t('supply.paidMarkReceived')}
            doneBusy={isBusy}
            onDone={() => void run((b, id) => receiveSupplyOrder(b, id, 'UPI'))}
          />
        ) : null}
        {/* "Received, not paid yet" still records the goods — they did arrive —
            and leaves a Pay button on the order. */}
        <button
          type="button"
          className={panelStyles.skip}
          disabled={isBusy}
          onClick={() => void run((b, id) => receiveSupplyOrder(b, id, 'NOT_YET'))}
        >
          {t('supply.receivedNotPaid')}
        </button>
      </div>
    );
  } else if (panel === 'pay') {
    question = (
      <div className={panelStyles.stack}>
        <UpiPayCard
          payee={payee}
          amount={Number(order.totalAmount)}
          currency={order.currency}
          note={qrNote}
          doneBusy={isBusy}
          onDone={() => void run((b, id) => paySupplyOrder(b, id, 'UPI'))}
        />
        {/* Cash is a real answer for a vendor — their own person was at the
            counter — and never for the warehouse, whose cash goes through the agent. */}
        {fromVendor ? (
          <Button
            block
            title={t('supply.paidVendorCash')}
            icon={IoCashOutline}
            disabled={isBusy}
            onClick={() => void run((b, id) => paySupplyOrder(b, id, 'CASH'))}
          />
        ) : null}
      </div>
    );
  } else if (panel === 'dispatch' || panel === 'assign') {
    question = (
      <AgentPicker
        title={t('supply.assignAgent')}
        submitLabel={panel === 'dispatch' ? t('supply.dispatch') : t('supply.reassign')}
        allowNobody={panel === 'dispatch'}
        isBusy={isBusy}
        onSubmit={submitAgent}
        onCancel={() => setPanel('none')}
      />
    );
  } else if (panel === 'delay' || panel === 'reject') {
    const isDelay = panel === 'delay';
    question = (
      <form
        className={panelStyles.panel}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = note.trim() || undefined;
          void run((b, id) =>
            isDelay
              ? postSupplyDelay(b, id, { delayMinutes: Number(delayMinutes) || 0, reasonCode: reason, note: trimmed })
              : rejectSupplyOrder(b, id, { reasonCode: reason, note: trimmed })
          );
        }}
      >
        <p className={panelStyles.title}>{isDelay ? t('supply.delayTitle') : t('supply.reject')}</p>
        {isDelay ? (
          <FormInput
            label={t('supply.delayMinutes')}
            icon={IoTimeOutline}
            inputMode="numeric"
            maxLength={4}
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(e.target.value.replace(/\D/g, ''))}
            className={styles.minutes}
          />
        ) : null}
        {/* Six reasons: a wrap of chips each the width of its own words. */}
        <ChipGroup
          name="supply-reason"
          label={t('supply.delayReason')}
          options={DELAY_REASONS.map((value) => ({ value, label: t(`supplyDelay.${value}`) }))}
          value={reason}
          onChange={setReason}
        />
        <FormTextArea
          label={t('supply.note')}
          hint={t('supply.noteOptional')}
          icon={IoChatbubbleEllipsesOutline}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className={panelStyles.actions}>
          <Button title={t('common.cancel')} onClick={() => setPanel('none')} disabled={isBusy} />
          <PrimaryButton
            type="submit"
            title={isDelay ? t('supply.postDelay') : t('supply.reject')}
            icon={isDelay ? IoTimeOutline : IoBanOutline}
            loading={isBusy}
          />
        </div>
      </form>
    );
  }

  const items = (
    <Card title={t('supply.reviewCount', { count: order.items.length })}>
      <ul className={styles.items}>
        {order.items.map((line) => (
          <li key={line.id} className={styles.item}>
            <span className={styles.itemName}>{line.itemNameSnapshot}</span>
            <span className={styles.itemQty}>
              {Number(line.quantity)} {line.unitSnapshot}
            </span>
            <span className={styles.itemTotal}>{formatAmount(Number(line.lineTotal), order.currency)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.total}>
        <span>{t('supply.total')}</span>
        <strong>{amount}</strong>
      </p>
    </Card>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title={order.orderNumber === null ? t('supply.draftTitle') : t('supply.orderTitle', { number: order.orderNumber })}
        subtitle={order.branch?.name}
        backTo={backTo}
      />

      <div className={styles.layout}>
        <div className={styles.column}>
          <Enter delay={step(1)} className={styles.summary}>
            {summary}
          </Enter>
          {error ? <ErrorBanner key={error} message={error} className={styles.error} /> : null}
          {actionArea ? (
            <Enter delay={step(2)} className={styles.actionArea}>
              {actionArea}
            </Enter>
          ) : null}
          {question ? (
            <Enter delay={0} className={styles.question}>
              {question}
            </Enter>
          ) : null}
          <Enter delay={step(3)} className={styles.itemsArea}>
            {items}
          </Enter>
        </div>

        <div className={styles.column}>
          {/* Where it is going: for the person carrying it, this is the whole job. */}
          {order.status !== 'DRAFT' ? (
            <Enter delay={step(2)} className={styles.addressArea}>
              <DeliveryAddress branch={order.branch} />
            </Enter>
          ) : null}
          {order.events.length > 0 ? (
            <Enter delay={step(4)} className={styles.timelineArea}>
              <Card title={t('supply.timeline')}>
                <SupplyTimeline events={order.events} fromVendor={fromVendor} />
              </Card>
            </Enter>
          ) : null}
        </div>
      </div>
    </div>
  );
}
