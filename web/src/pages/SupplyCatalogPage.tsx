import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { IoAdd, IoArrowForward, IoChevronForward, IoCubeOutline, IoStorefrontOutline } from 'react-icons/io5';
import { groupCatalog, hasVendorItems, quantitiesInCart } from '@shared/utils/supplyGroups';
import { extractErrorMessage } from '@/api/client';
import { addSupplyCartItem, getSupplyCart, listSupplyItems } from '@/api/supply';
import BranchPicker from '@/components/branches/BranchPicker';
import ButtonLink from '@/components/ui/ButtonLink';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import InfoCard from '@/components/ui/InfoCard';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/SearchField';
import Spinner from '@/components/ui/Spinner';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import type { SupplyItem, SupplyOrder } from '@/types/supply';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import styles from './SupplyCatalogPage.module.css';

/**
 * The raw-material catalog — requirement 5, the app's Raw material screen.
 *
 * One page doing two jobs on purpose, because it is one list: a branch clicks to
 * add to its order, and the warehouse desk clicks to edit what it stocks. Two
 * pages would show the same rows, and the desk's copy would be the one that
 * forgot to show a withdrawn item.
 *
 * Quantities are not set here: a click adds one, and the exact amount is typed in
 * the cart, where a number field has room to be one.
 *
 * Once some items come from a vendor (requirement 25), the list is headed by who
 * supplies each part — the warehouse, then each vendor — with the categories
 * beneath. A business with no vendor items sees just the categories.
 */
export default function SupplyCatalogPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const business = useAuthStore((s) => s.business);
  // Where goods move: a warehouse does not order raw material from itself.
  const { tradingBranches: branches } = useBranches();
  const [searchParams, setSearchParams] = useSearchParams();

  const canOrder = hasCapability(membership, 'supplyOrder:create');
  const canManage = hasCapability(membership, 'supplyItem:manage');

  const requested = searchParams.get('branch');
  const branchId = branches.find((b) => b.id === requested)?.id ?? branches[0]?.id ?? null;

  const [items, setItems] = useState<SupplyItem[]>([]);
  const [cart, setCart] = useState<SupplyOrder | null>(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request's answer is shown: switching branch quickly must
  // never leave one branch's cart under another's name.
  const latest = useRef(0);

  const currency = business?.defaultCurrency ?? 'INR';

  const load = useCallback(async () => {
    if (!businessId) return;
    const request = ++latest.current;
    setError(null);
    try {
      // The desk needs what it has withdrawn, to bring it back; a branch is shown
      // only what can be ordered.
      const [list, branchCart] = await Promise.all([
        listSupplyItems(businessId, { includeInactive: canManage }),
        canOrder && branchId ? getSupplyCart(businessId, branchId) : Promise.resolve(null),
      ]);
      if (request !== latest.current) return;
      setItems(list);
      setCart(branchCart);
    } catch (err) {
      if (request === latest.current) setError(extractErrorMessage(err));
    } finally {
      if (request === latest.current) setIsLoading(false);
    }
  }, [businessId, branchId, canManage, canOrder]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(load, { onMount: false });

  const shownCart = cart && cart.branchId === branchId ? cart : null;
  const inCart = useMemo(() => quantitiesInCart(shownCart?.items), [shownCart]);
  const bySupplier = useMemo(() => hasVendorItems(items), [items]);
  const grouped = useMemo(
    () => groupCatalog(items, { search, uncategorised: t('supply.uncategorised') }),
    [items, search, t]
  );

  async function addOne(item: SupplyItem) {
    if (!businessId || !branchId || busyItemId) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      setCart(await addSupplyCartItem(businessId, { branchId, inventoryItemId: item.id, quantity: 1 }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  const cartCount = shownCart?.items.length ?? 0;
  let delay = 1;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('supply.catalogTitle')}
        subtitle={t('supply.catalogSubtitle')}
        actions={canManage ? <ButtonLink to={pathTo('addSupplyItem')} title={t('supply.addItem')} icon={IoAdd} /> : null}
      />

      {/* Where the desk manages who supplies what outside the warehouse: vendors
          are part of the catalog, and the desk has no other way in. */}
      {canManage ? (
        <Enter delay={step(delay++)}>
          <InfoCard
            icon={IoStorefrontOutline}
            title={t('vendors.title')}
            subtitle={t('vendors.entrySubtitle')}
            to={pathTo('vendors')}
          />
        </Enter>
      ) : null}

      {canOrder && branches.length > 1 ? (
        <Enter delay={step(delay++)}>
          <BranchPicker
            name="supply-branch"
            legend={t('supply.branch')}
            branches={branches}
            value={branchId}
            onChange={(id) => setSearchParams({ branch: id }, { replace: true })}
          />
        </Enter>
      ) : null}

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {items.length > 6 ? (
        <Enter delay={step(delay++)}>
          <SearchField label={t('supply.search')} value={search} onChange={setSearch} />
        </Enter>
      ) : null}

      {isLoading && items.length === 0 ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : items.length === 0 && !error ? (
        <Enter delay={step(delay)} className={styles.empty}>
          <IoCubeOutline size={22} aria-hidden="true" />
          <p className={styles.emptyTitle}>{t('supply.catalogEmpty')}</p>
          <p className={styles.emptyBody}>{t('supply.catalogEmptyBody')}</p>
        </Enter>
      ) : (
        grouped.map((supplier, supplierIndex) => (
          <Enter key={supplier.key || 'warehouse'} delay={step(Math.min(delay + supplierIndex, 5))} className={styles.supplier}>
            {bySupplier ? (
              <h2 className={styles.supplierTitle}>
                {supplier.label ? <IoStorefrontOutline size={18} aria-hidden="true" /> : <IoCubeOutline size={18} aria-hidden="true" />}
                <span>{supplier.label ? t('supply.fromVendor', { name: supplier.label }) : t('supply.fromWarehouse')}</span>
              </h2>
            ) : null}
            {supplier.categories.map(([category, group]) => (
              <section key={category} className={styles.category} aria-label={category}>
                <h3 className={styles.categoryTitle}>{category}</h3>
                <ul className={styles.grid}>
                  {group.map((item) => (
                    <CatalogRow
                      key={item.id}
                      item={item}
                      currency={currency}
                      inCart={inCart.get(item.id) ?? 0}
                      canOrder={canOrder && !!branchId}
                      canManage={canManage}
                      busy={busyItemId !== null}
                      onAdd={() => void addOne(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </Enter>
        ))
      )}

      {/* The order stays in view while the list scrolls under it, as the counter's bill does. */}
      {canOrder && shownCart && cartCount > 0 ? (
        <div className={styles.tray}>
          <div className={styles.trayText}>
            <p className={styles.trayCount}>{t('supply.reviewCount', { count: cartCount })}</p>
            <p className={styles.trayTotal}>{formatAmount(Number(shownCart.totalAmount), shownCart.currency)}</p>
          </div>
          <ButtonLink
            to={pathTo('supplyCart', { supplyOrderId: shownCart.id })}
            title={t('supply.openCart')}
            icon={IoArrowForward}
            className={styles.trayButton}
          />
        </div>
      ) : null}
    </div>
  );
}

function CatalogRow({
  item,
  currency,
  inCart,
  canOrder,
  canManage,
  busy,
  onAdd,
}: {
  item: SupplyItem;
  currency: string;
  inCart: number;
  canOrder: boolean;
  canManage: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const orderable = item.isActive && item.unitPrice !== null;
  const meta = [
    item.unitPrice === null
      ? t('supply.noPriceYet')
      : t('supply.perUnit', { price: formatAmount(Number(item.unitPrice), currency), unit: item.unit }),
    item.isActive ? null : t('supply.withdrawn'),
  ]
    .filter(Boolean)
    .join(' · ');

  const text = (
    <span className={styles.rowText}>
      <span className={styles.rowName}>{item.name}</span>
      <span className={styles.rowMeta}>{meta}</span>
    </span>
  );
  const editTo = pathTo('editSupplyItem', { inventoryItemId: item.id });

  // The desk edits and never orders: the whole row opens the item.
  if (canManage && !canOrder) {
    return (
      <li>
        <Link to={editTo} className={cx(styles.row, styles.rowLink, !item.isActive && styles.withdrawn)}>
          {text}
          <IoChevronForward className={styles.chevron} size={18} aria-hidden="true" />
        </Link>
      </li>
    );
  }

  return (
    <li className={cx(styles.row, !item.isActive && styles.withdrawn)}>
      {/* Whoever also orders opens the item from its name; for anyone else it is just text. */}
      {canManage ? (
        <Link to={editTo} className={styles.nameLink}>
          {text}
        </Link>
      ) : (
        text
      )}

      {canOrder && orderable ? (
        <button
          type="button"
          className={cx(styles.addChip, inCart > 0 && styles.addChipActive)}
          onClick={onAdd}
          disabled={busy}
          aria-label={
            inCart > 0 ? t('web.supply.addAnother', { name: item.name, count: inCart }) : t('web.supply.addOne', { name: item.name })
          }
          title={t('web.supply.addOne', { name: item.name })}
        >
          {inCart > 0 ? <span className={styles.addChipCount}>{inCart}</span> : <IoAdd size={17} aria-hidden="true" />}
        </button>
      ) : null}
    </li>
  );
}
