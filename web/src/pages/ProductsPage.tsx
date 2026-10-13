import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoAdd, IoPricetagsOutline, IoSearchOutline, IoStorefrontOutline } from 'react-icons/io5';
import BranchPicker from '@/components/branches/BranchPicker';
import ProductRow from '@/components/products/ProductRow';
import { groupByCategory, matchesQuery } from '@/components/products/catalog';
import ButtonLink from '@/components/ui/ButtonLink';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import InfoCard from '@/components/ui/InfoCard';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/SearchField';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import { useBranchProducts } from '@/hooks/useBranchProducts';
import { useBranches } from '@/hooks/useBranches';
import { useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { canOpenRoute, pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { hasCapability } from '@/utils/permissions';
import styles from './ProductsPage.module.css';

/**
 * The catalog — requirement 4, the app's Products screen.
 *
 * One branch at a time, because a price only means something relative to a
 * branch. The branch is in the address (`?branch=`), so Home's "See all" opens
 * the branch it was showing and a reload keeps the choice.
 *
 * Two things the app does not have: a search box, and — for whoever manages the
 * catalog — *Show withdrawn*. The app lists only what is on sale, so a product
 * withdrawn and left can never be found again to put back on sale.
 */
export default function ProductsPage() {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { tradingBranches: branches, isLoading: branchesLoading } = useBranches();
  const canManage = hasCapability(membership, 'product:manage');

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('branch');
  // The branch the address names, when this person can reach it; otherwise the
  // first one, so the page is useful on open rather than asking first.
  const branchId = branches.find((b) => b.id === requested)?.id ?? branches[0]?.id ?? null;

  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [query, setQuery] = useState('');
  const { products, isLoading, error, refresh } = useBranchProducts(branchId, canManage && showWithdrawn);
  useRefreshOnFocus(refresh, { onMount: false });

  const groups = useMemo(
    () =>
      groupByCategory(
        products.filter((product) => matchesQuery(product, query)),
        t('products.uncategorised')
      ),
    [products, query, t]
  );

  const currency = business?.defaultCurrency ?? 'INR';
  const settled = !isLoading && !branchesLoading;
  const isEmpty = settled && !error && products.length === 0 && !showWithdrawn;
  const showTools = !!branchId && (products.length > 0 || query !== '' || showWithdrawn);

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('products.title')}
        actions={
          canManage && branchId ? (
            <ButtonLink
              to={`${pathTo('addProduct')}?branch=${encodeURIComponent(branchId)}`}
              title={t('products.add')}
              icon={IoAdd}
            />
          ) : null
        }
      />

      {branches.length > 1 ? (
        <Enter delay={step(1)}>
          <Card>
            <BranchPicker
              name="products-branch"
              legend={t('products.branchSection')}
              branches={branches}
              value={branchId}
              onChange={(id) => setSearchParams({ branch: id }, { replace: true })}
            />
          </Card>
        </Enter>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}

      {/* No branch is a different state from no products: a catalog is priced per
          branch, so there is nowhere to put one yet. */}
      {!branchId && !branchesLoading ? (
        <Enter delay={step(1)}>
          <InfoCard
            icon={IoStorefrontOutline}
            title={t('products.noBranchTitle')}
            subtitle={t('products.noBranchSubtitle')}
            to={canOpenRoute(membership, 'addBranch') ? pathTo('addBranch') : undefined}
          />
        </Enter>
      ) : null}

      {showTools ? (
        <Enter delay={step(2)} className={styles.tools}>
          <SearchField label={t('web.products.search')} value={query} onChange={setQuery} className={styles.search} />
          {canManage ? (
            // Not a <label>: the switch is one already, and labels do not nest.
            <div className={styles.withdrawnToggle}>
              <span aria-hidden="true">{t('web.products.showWithdrawn')}</span>
              <Toggle checked={showWithdrawn} onChange={setShowWithdrawn} label={t('web.products.showWithdrawn')} />
            </div>
          ) : null}
        </Enter>
      ) : null}

      {branchId && isLoading && products.length === 0 ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : null}

      {branchId && isEmpty ? (
        <Enter delay={step(2)} className={styles.empty}>
          <IoPricetagsOutline size={24} aria-hidden="true" />
          <p className={styles.emptyTitle}>{t('products.emptyTitle')}</p>
          <p className={styles.emptyBody}>{canManage ? t('products.emptyBody') : t('products.emptyBodyReadOnly')}</p>
        </Enter>
      ) : null}

      {query && products.length > 0 && groups.length === 0 ? (
        <div className={styles.empty}>
          <IoSearchOutline size={22} aria-hidden="true" />
          <p className={styles.emptyBody}>{t('web.products.noMatch', { query: query.trim() })}</p>
        </div>
      ) : null}

      {groups.map(([category, items], index) => (
        <Enter key={category} as="section" delay={step(Math.min(index + 2, 5))} className={styles.group}>
          <h2 className={styles.groupTitle}>{category}</h2>
          <ul className={styles.list}>
            {items.map((product) => (
              <li key={product.id}>
                <ProductRow
                  product={product}
                  currency={currency}
                  to={canManage ? pathTo('editProduct', { productId: product.id }) : undefined}
                />
              </li>
            ))}
          </ul>
        </Enter>
      ))}
    </div>
  );
}
