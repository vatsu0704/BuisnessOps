import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoChevronForward, IoPricetagsOutline } from 'react-icons/io5';
import { useBranchProducts } from '@/hooks/useBranchProducts';
import { useBranches } from '@/hooks/useBranches';
import { useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { hasCapability } from '@/utils/permissions';
import ProductRow from '@/components/products/ProductRow';
import styles from './BranchCatalogSection.module.css';

const PREVIEW_COUNT = 5;

/**
 * Requirement 4: "after login, show the products on the home page". A preview of
 * the first branch this person can reach — for a cashier, their branch — and the
 * Products page is where the whole catalog and the branch picker live.
 */
export default function BranchCatalogSection() {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { tradingBranches } = useBranches();

  const branchId = tradingBranches[0]?.id ?? null;
  const { products, error, refresh } = useBranchProducts(branchId);
  // useBranchProducts fetches on mount itself; this adds only the tab coming back.
  useRefreshOnFocus(refresh, { onMount: false });

  // With no branch there is nowhere to price a catalog; Home already offers
  // "add your first branch" above.
  if (!branchId) return null;

  const canManage = hasCapability(membership, 'product:manage');
  const currency = business?.defaultCurrency ?? 'INR';
  const preview = products.slice(0, PREVIEW_COUNT);

  return (
    <section className={styles.card} aria-labelledby="home-catalog-title">
      <div className={styles.head}>
        <h2 id="home-catalog-title" className={styles.title}>
          {t('home.catalogTitle')}
        </h2>
        <Link to={`${pathTo('products')}?branch=${encodeURIComponent(branchId)}`} className={styles.link}>
          <span>{t('home.catalogAll')}</span>
          <IoChevronForward size={14} aria-hidden="true" />
        </Link>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {!error && products.length === 0 ? (
        canManage ? (
          <Link to={`${pathTo('addProduct')}?branch=${encodeURIComponent(branchId)}`} className={styles.empty}>
            <IoPricetagsOutline size={20} aria-hidden="true" />
            <span>{t('home.catalogEmpty')}</span>
          </Link>
        ) : (
          <div className={styles.empty}>
            <IoPricetagsOutline size={20} aria-hidden="true" />
            <span>{t('home.catalogEmptyReadOnly')}</span>
          </div>
        )
      ) : null}

      {preview.length > 0 ? (
        <ul className={styles.list}>
          {preview.map((product) => (
            <li key={product.id}>
              <ProductRow
                product={product}
                currency={currency}
                to={canManage ? pathTo('editProduct', { productId: product.id }) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {products.length > PREVIEW_COUNT ? (
        <p className={styles.more}>{t('common.more', { count: products.length - PREVIEW_COUNT })}</p>
      ) : null}
    </section>
  );
}
