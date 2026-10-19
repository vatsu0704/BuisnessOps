import { useCallback, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IoAlertCircleOutline, IoCheckmarkCircleOutline, IoChevronDown, IoChevronUp, IoQrCodeOutline, IoStorefrontOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import {
  getPaymentAccount,
  setBranchCounterAccount,
  setCounterAccount,
  setPaymentAccount,
  setVendorUpi,
} from '@/api/supply';
import UpiAccountEditor from '@/components/payments/UpiAccountEditor';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useVendors } from '@/hooks/useVendors';
import { refreshVendors } from '@/store/vendorStore';
import { step } from '@/theme/motion';
import type { PaymentAccount } from '@/types/supply';
import { cx } from '@/utils/cx';
import { hasCapability } from '@/utils/permissions';
import styles from './PaymentAccountsPage.module.css';

/**
 * Payment QR codes — where money goes (requirements 26 and 32), the app's screen.
 *
 * Where counter customers pay — the business's UPI ID and each shop's own — then
 * the warehouse's, then each vendor's. Every payment QR is made from these, with
 * the exact amount in it, so this is the only place a QR is "set up".
 *
 * The counter's section is for every plan; the warehouse's shows for whoever
 * confirms payments to it, and the vendors' for whoever sees the catalog. Behind
 * `paymentAccount:manage` — accounts and the owner — because whoever can change
 * where money goes must not also be whoever ships the goods.
 *
 * Shops and vendors are rows that open one at a time: those lists grow with the
 * business, and a page of open forms is a page nobody can find their way down.
 */
export default function PaymentAccountsPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const showWarehouse = hasCapability(membership, 'supplyPayment:verify');
  const showVendors = hasCapability(membership, 'supplyItem:view');
  const { vendors, isLoading: vendorsLoading, error: vendorsError, refresh: refreshVendorList } = useVendors();

  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [openVendorId, setOpenVendorId] = useState<string | null>(null);
  const [openBranchId, setOpenBranchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      setAccount(await getPaymentAccount(businessId));
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId]);

  useRefreshOnFocus(() => {
    void load();
    if (showVendors) void refreshVendorList();
  });

  async function saveVendor(vendorId: string, upiId: string | null, upiName: string | null) {
    if (!businessId) return;
    await setVendorUpi(businessId, vendorId, { upiId, upiName });
    // The cart, the vendors list and the item form read one list.
    await refreshVendors();
  }

  const shownError = error ?? (showVendors ? vendorsError : null);

  return (
    <div className={styles.page}>
      <PageHeader title={t('paymentAccounts.title')} subtitle={t('paymentAccounts.subtitle')} />

      {shownError ? <ErrorBanner key={shownError} message={shownError} /> : null}

      <Enter delay={step(1)} className={styles.explainer}>
        <IoQrCodeOutline size={18} aria-hidden="true" />
        <p>{t('paymentAccounts.explainer')}</p>
      </Enter>

      {!account ? (
        error ? null : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )
      ) : (
        <>
          <Enter delay={step(2)}>
            <Section title={t('paymentAccounts.counterSection')} hint={t('paymentAccounts.counterHint')}>
              <UpiAccountEditor
                payeeLabel={t('paymentAccounts.counterPayee')}
                fallbackName={account.businessName}
                upiId={account.counter.upiId}
                upiName={account.counter.upiName}
                updatedAt={account.counter.upiUpdatedAt}
                updatedByName={account.counter.upiUpdatedByMembership?.user?.name ?? null}
                removeBody={t('paymentAccounts.counterRemoveBody')}
                onSave={async (upiId, upiName) => {
                  if (businessId) setAccount(await setCounterAccount(businessId, { upiId, upiName }));
                }}
              />
              {account.counterBranches.length > 0 ? (
                <>
                  <p className={styles.subHint}>{t('paymentAccounts.counterBranchesHint')}</p>
                  <ul className={styles.list}>
                    {account.counterBranches.map((branch) => (
                      <ExpandableRow
                        key={branch.branchId}
                        open={openBranchId === branch.branchId}
                        onToggle={() => setOpenBranchId(openBranchId === branch.branchId ? null : branch.branchId)}
                        title={branch.name}
                        meta={branch.upiId ?? t('paymentAccounts.usesBusinessUpi')}
                        pills={
                          <>
                            <Pill
                              label={t(branch.operatingModel === 'FOCO' ? 'addBranch.modelFoco' : 'addBranch.modelFm')}
                              tone="muted"
                            />
                            {branch.upiId ? (
                              <Pill label={t('paymentAccounts.ownUpi')} tone="success" icon={IoCheckmarkCircleOutline} />
                            ) : null}
                          </>
                        }
                      >
                        <UpiAccountEditor
                          payeeLabel={branch.name}
                          fallbackName={account.businessName}
                          upiId={branch.upiId}
                          upiName={branch.upiName}
                          updatedAt={branch.upiUpdatedAt}
                          updatedByName={branch.upiUpdatedByMembership?.user?.name ?? null}
                          removeBody={t('paymentAccounts.counterBranchRemoveBody')}
                          onSave={async (upiId, upiName) => {
                            if (businessId) {
                              setAccount(await setBranchCounterAccount(businessId, branch.branchId, { upiId, upiName }));
                            }
                          }}
                        />
                      </ExpandableRow>
                    ))}
                  </ul>
                </>
              ) : null}
            </Section>
          </Enter>

          {showWarehouse ? (
            <Enter delay={step(3)}>
              <Section title={t('paymentAccounts.warehouseSection')} hint={t('paymentAccounts.warehouseHint')}>
                <UpiAccountEditor
                  payeeLabel={t('supply.fromWarehouse')}
                  fallbackName={account.businessName}
                  upiId={account.upiId}
                  upiName={account.upiName}
                  updatedAt={account.upiUpdatedAt}
                  updatedByName={account.upiUpdatedByMembership?.user?.name ?? null}
                  onSave={async (upiId, upiName) => {
                    if (businessId) setAccount(await setPaymentAccount(businessId, { upiId, upiName }));
                  }}
                />
              </Section>
            </Enter>
          ) : null}

          {showVendors ? (
            <Enter delay={step(4)}>
              <Section title={t('paymentAccounts.vendorsSection')} hint={t('paymentAccounts.vendorsHint')}>
                {!vendorsLoading && vendors.length === 0 ? (
                  <div className={styles.empty}>
                    <IoStorefrontOutline size={22} aria-hidden="true" />
                    <p className={styles.emptyTitle}>{t('vendors.empty')}</p>
                    <p className={styles.emptyBody}>{t('paymentAccounts.noVendorsBody')}</p>
                  </div>
                ) : null}
                <ul className={styles.list}>
                  {vendors.map((vendor) => (
                    <ExpandableRow
                      key={vendor.id}
                      open={openVendorId === vendor.id}
                      onToggle={() => setOpenVendorId(openVendorId === vendor.id ? null : vendor.id)}
                      title={vendor.name}
                      meta={vendor.upiId ?? t('paymentAccounts.noUpiYet')}
                      withdrawn={!vendor.isActive}
                      pills={
                        <>
                          <Pill
                            label={vendor.upiId ? t('paymentAccounts.qrSet') : t('paymentAccounts.qrNotSet')}
                            tone={vendor.upiId ? 'success' : 'warning'}
                            icon={vendor.upiId ? IoCheckmarkCircleOutline : IoAlertCircleOutline}
                          />
                          {!vendor.isActive ? <Pill label={t('supply.withdrawn')} tone="muted" /> : null}
                        </>
                      }
                    >
                      <UpiAccountEditor
                        payeeLabel={vendor.name}
                        fallbackName={vendor.name}
                        upiId={vendor.upiId}
                        upiName={vendor.upiName}
                        updatedAt={vendor.upiUpdatedAt}
                        updatedByName={vendor.upiUpdatedByMembership?.user?.name ?? null}
                        onSave={(upiId, upiName) => saveVendor(vendor.id, upiId, upiName)}
                      />
                    </ExpandableRow>
                  ))}
                </ul>
              </Section>
            </Enter>
          ) : null}
        </>
      )}
    </div>
  );
}

/** A heading and a sentence over its editors — as the app sets them, not a card around cards. */
function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

/** A shop or a vendor: its name and where its money goes, opening to its editor. */
function ExpandableRow({
  open,
  onToggle,
  title,
  meta,
  pills,
  withdrawn = false,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  meta: string;
  pills: ReactNode;
  withdrawn?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={cx(styles.item, withdrawn && styles.withdrawn)}>
      <button type="button" className={cx(styles.row, open && styles.rowOpen)} aria-expanded={open} onClick={onToggle}>
        <span className={styles.rowText}>
          <span className={styles.rowName}>{title}</span>
          <span className={styles.rowMeta}>{meta}</span>
          <span className={styles.pills}>{pills}</span>
        </span>
        {open ? <IoChevronUp size={18} aria-hidden="true" /> : <IoChevronDown size={18} aria-hidden="true" />}
      </button>
      {open ? <div className={styles.editor}>{children}</div> : null}
    </li>
  );
}
