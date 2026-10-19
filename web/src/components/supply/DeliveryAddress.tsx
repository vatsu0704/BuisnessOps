import { useTranslation } from 'react-i18next';
import { IoNavigateOutline, IoOpenOutline } from 'react-icons/io5';
import Card from '@/components/ui/Card';
import type { SupplyDestination } from '@/types/supply';
import styles from './DeliveryAddress.module.css';

/**
 * Coordinates when the branch has them, the written address otherwise — both
 * through Google Maps' documented `?api=1&query=` form.
 */
function mapUrl(branch: SupplyDestination, written: string): string | null {
  const query =
    branch.latitude !== null && branch.longitude !== null
      ? `${branch.latitude},${branch.longitude}`
      : written
        ? `${branch.name}, ${written}`
        : null;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/**
 * Where this order is going — the app's `DeliveryAddress`. The destination
 * travels on the order itself, because the delivery agent holds no capability to
 * read a branch. Shown to everyone who can see the order: for the branch that
 * placed it, it is the one place the address it will be delivered to is visible,
 * which is how a wrong one gets noticed before a rider does.
 */
export default function DeliveryAddress({ branch }: { branch: SupplyDestination | null }) {
  const { t } = useTranslation();
  if (!branch) return null;

  // The street line as typed — multi-line on purpose, a landmark is usually the
  // half that finds the place — then the locality. The country is a code ("IN")
  // no rider needs.
  const locality = [branch.city, branch.region, branch.postalCode].filter(Boolean).join(', ');
  const written = [branch.addressLine, locality].filter(Boolean).join('\n');
  const href = mapUrl(branch, [branch.addressLine, locality].filter(Boolean).join(', '));

  return (
    <Card title={t('supply.deliverTo')}>
      <p className={styles.name}>
        {branch.name} · {branch.code}
      </p>
      {written ? <p className={styles.address}>{written}</p> : <p className={styles.missing}>{t('supply.noAddress')}</p>}
      {href ? (
        <a className={styles.map} href={href} target="_blank" rel="noopener noreferrer">
          <IoNavigateOutline size={14} aria-hidden="true" />
          <span>{t('supply.openMap')}</span>
          <IoOpenOutline size={12} aria-hidden="true" />
        </a>
      ) : null}
    </Card>
  );
}
