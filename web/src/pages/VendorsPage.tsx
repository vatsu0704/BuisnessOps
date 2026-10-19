import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IoAdd, IoAlertCircleOutline, IoCheckmarkCircleOutline, IoChevronForward, IoStorefrontOutline } from 'react-icons/io5';
import ButtonLink from '@/components/ui/ButtonLink';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import { useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useVendors } from '@/hooks/useVendors';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { hasPlanFeature } from '@/utils/permissions';
import styles from './VendorsPage.module.css';

/**
 * Third-party vendors — requirement 25, the warehouse desk's list (the app's
 * Vendors screen). Who supplies what outside the warehouse: the water, the ice.
 * Withdrawn ones stay listed, dimmed, so they can be brought back.
 *
 * Each row says whether accounts has set up where a payment to them goes, because
 * a franchise branch cannot pay a vendor "now" until it has — and the desk is who
 * notices a missing one first, though it is deliberately not who can set it.
 */
export default function VendorsPage() {
  const { t } = useTranslation();
  const { vendors, isLoading, error, refresh } = useVendors();
  // Adding a vendor is part of Franchise (requirement 28); the list, and editing
  // the vendors a business already has, stay on every plan.
  const canAddVendors = hasPlanFeature(useMembership(), 'vendors');

  useRefreshOnFocus(refresh, { onMount: false });

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('vendors.title')}
        subtitle={t('vendors.subtitle')}
        backTo={pathTo('supply')}
        actions={canAddVendors ? <ButtonLink to={pathTo('addVendor')} title={t('vendors.add')} icon={IoAdd} /> : null}
      />

      {!canAddVendors ? (
        <Enter delay={step(1)}>
          <p className={styles.planNote}>{t('plans.vendorsOnFranchise')}</p>
        </Enter>
      ) : null}

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {isLoading && vendors.length === 0 ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : vendors.length === 0 ? (
        error ? null : (
          <Enter delay={step(2)} className={styles.empty}>
            <IoStorefrontOutline size={22} aria-hidden="true" />
            <p className={styles.emptyTitle}>{t('vendors.empty')}</p>
            <p className={styles.emptyBody}>{t('vendors.emptyBody')}</p>
          </Enter>
        )
      ) : (
        <Enter delay={step(2)}>
          <ul className={styles.list}>
            {vendors.map((vendor) => (
              <li key={vendor.id}>
                <Link
                  to={pathTo('editVendor', { vendorId: vendor.id })}
                  className={cx(styles.row, !vendor.isActive && styles.withdrawn)}
                >
                  <span className={styles.iconTile} aria-hidden="true">
                    <IoStorefrontOutline size={18} />
                  </span>
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{vendor.name}</span>
                    {vendor.phone ? <span className={styles.rowMeta}>{vendor.phone}</span> : null}
                    <span className={styles.pills}>
                      <Pill
                        label={vendor.upiId ? t('paymentAccounts.qrSet') : t('paymentAccounts.qrNotSet')}
                        tone={vendor.upiId ? 'success' : 'warning'}
                        icon={vendor.upiId ? IoCheckmarkCircleOutline : IoAlertCircleOutline}
                      />
                      {!vendor.isActive ? <Pill label={t('supply.withdrawn')} tone="muted" /> : null}
                    </span>
                  </span>
                  <IoChevronForward className={styles.chevron} size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Enter>
      )}
    </div>
  );
}
