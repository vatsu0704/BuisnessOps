import { useTranslation } from 'react-i18next';
import { IoAdd } from 'react-icons/io5';
import type { BranchProduct } from '@/types/product';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import styles from './ProductGrid.module.css';

/**
 * The menu — a tile per product with a price, each a button, as many across as
 * the column holds (the app derives the same from the screen's width). A tile on
 * the bill shows how many; Enter or Space on a focused tile adds one, so the
 * counter works from a keyboard as well as a mouse or a touch screen.
 */
export default function ProductGrid({
  products,
  onCart,
  currency,
  onAdd,
}: {
  products: BranchProduct[];
  onCart: Map<string, number>;
  currency: string;
  onAdd: (product: BranchProduct) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className={styles.grid} aria-label={t('counter.tapToAdd')}>
      {products.map((product) => {
        const count = onCart.get(product.id) ?? 0;
        return (
          <li key={product.id} className={styles.cell}>
            <button
              type="button"
              className={cx(styles.tile, count > 0 && styles.onBill)}
              onClick={() => onAdd(product)}
            >
              <span className={styles.name}>{product.name}</span>
              <span className={styles.foot}>
                <span className={styles.price}>{formatAmount(Number(product.effectiveSellPrice), currency)}</span>
                {count > 0 ? (
                  <span className={styles.count}>{count}</span>
                ) : (
                  <IoAdd size={16} className={styles.plus} aria-hidden="true" />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
