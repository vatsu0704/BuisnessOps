import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoChevronForward } from 'react-icons/io5';
import Pill from '@/components/ui/Pill';
import type { BranchProduct } from '@/types/product';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import styles from './ProductRow.module.css';

type Props = {
  product: BranchProduct;
  currency: string;
  /** Where the row opens; a plain row without it. */
  to?: string;
};

/**
 * One catalog row: name, what it is sold by, and what *this branch* charges — a
 * branch override shows as the price, never the business-wide default. A
 * withdrawn product (listed only when asked for) says so and is drawn faded.
 */
export default function ProductRow({ product, currency, to }: Props) {
  const { t } = useTranslation();
  const price = product.effectiveSellPrice;
  const isBranchOwn = product.branchId !== null;
  const isOverridden = product.branchDetail !== null;
  const isWithdrawn = !product.effectiveIsActive;

  const body: ReactNode = (
    <>
      <span className={styles.text}>
        <span className={styles.titleRow}>
          <span className={styles.name}>{product.name}</span>
          {isBranchOwn ? <Pill label={t('products.branchOnly')} tone="brand" className={styles.pill} /> : null}
          {isWithdrawn ? <Pill label={t('editProduct.withdrawn')} tone="muted" className={styles.pill} /> : null}
        </span>
        <span className={styles.meta}>{[product.unit, product.sku, product.category].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={styles.priceCol}>
        <span className={styles.price}>
          {price === null ? t('products.noPrice') : formatAmount(Number(price), currency)}
        </span>
        {isOverridden ? <span className={styles.overridden}>{t('products.branchPrice')}</span> : null}
      </span>
      {to ? <IoChevronForward size={16} className={styles.chevron} aria-hidden="true" /> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cx(styles.row, styles.interactive, isWithdrawn && styles.withdrawn)}>
        {body}
      </Link>
    );
  }
  return <div className={cx(styles.row, isWithdrawn && styles.withdrawn)}>{body}</div>;
}
