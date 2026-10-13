import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  IoCashOutline,
  IoCheckmarkCircle,
  IoCubeOutline,
  IoEyeOffOutline,
  IoEyeOutline,
  IoFolderOutline,
  IoPricetagOutline,
  IoRefresh,
  IoTrendingDownOutline,
} from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import {
  clearBranchPricing,
  getProduct,
  setBranchPricing,
  updateProduct,
  type ProductWithBranchPrices,
} from '@/api/product';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import BranchPicker from '@/components/branches/BranchPicker';
import { branchPriceAction } from '@/components/products/catalog';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { parseOptionalNumber } from '@/utils/validation';
import styles from './EditProductPage.module.css';

type Busy = 'details' | 'price' | 'active' | null;

/**
 * Edit a product, and set what one branch charges for it — the app's Edit
 * product screen.
 *
 * Two saves, deliberately apart: the product's own fields go to the
 * business-wide record, and a branch's price to that branch's override. One
 * button for both would make "change the price here" quietly change it
 * everywhere — the opposite of what requirement 4 asks for.
 *
 * Unlike the app, the branch's fields start from the price that branch already
 * charges, so changing it is an edit rather than retyping both figures.
 */
export default function EditProductPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { productId } = useParams<'productId'>();
  const { tradingBranches: branches } = useBranches();
  const goBack = useGoBack(pathTo('products'));

  const [product, setProduct] = useState<ProductWithBranchPrices | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');

  const [chosenPriceBranchId, setChosenPriceBranchId] = useState<string | null>(null);
  const [branchSell, setBranchSell] = useState('');
  const [branchCost, setBranchCost] = useState('');
  const [branchNotice, setBranchNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !productId) return;
    setLoadError(null);
    try {
      const found = await getProduct(businessId, productId);
      setProduct(found);
      setName(found.name);
      setUnit(found.unit);
      setCategory(found.category ?? '');
      setSellPrice(found.sellPrice ?? '');
      setCostPrice(found.costPrice ?? '');
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    }
  }, [businessId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A branch-only product is priced at its own branch and nowhere else, so the
  // picker would offer choices that all fail.
  const pricingBranches = product?.branchId ? branches.filter((b) => b.id === product.branchId) : branches;
  const priceBranchId =
    pricingBranches.find((b) => b.id === chosenPriceBranchId)?.id ?? pricingBranches[0]?.id ?? null;
  const override = product?.branchDetails.find((detail) => detail.branchId === priceBranchId) ?? null;

  // The fields show the chosen branch's own price, or nothing when it charges the business price.
  useEffect(() => {
    setBranchSell(override?.sellPrice ?? '');
    setBranchCost(override?.costPrice ?? '');
    setBranchNotice(null);
  }, [priceBranchId, override?.sellPrice, override?.costPrice]);

  if (loadError && !product) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('editProduct.title')} backTo={pathTo('products')} />
        <ErrorBanner message={loadError} />
        <div>
          <Button title={t('common.retry')} icon={IoRefresh} onClick={() => void load()} />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('editProduct.title')} backTo={pathTo('products')} />
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      </div>
    );
  }

  const current = product;
  const sellParsed = parseOptionalNumber(sellPrice);
  const costParsed = parseOptionalNumber(costPrice);
  const detailsValid = name.trim() !== '' && unit.trim() !== '' && sellParsed !== null && costParsed !== null;
  const priceAction = branchPriceAction(branchSell, branchCost, override !== null);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !detailsValid || busy) return;
    setBusy('details');
    setError(null);
    try {
      await updateProduct(businessId, current.id, {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || null,
        sellPrice: sellParsed ?? null,
        costPrice: costParsed ?? null,
      });
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(null);
    }
  }

  async function saveBranchPrice(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !priceBranchId || busy || priceAction.kind === 'none') return;
    setBusy('price');
    setError(null);
    try {
      if (priceAction.kind === 'clear') {
        await clearBranchPricing(businessId, current.id, priceBranchId);
      } else {
        await setBranchPricing(businessId, current.id, priceBranchId, {
          sellPrice: priceAction.sellPrice,
          costPrice: priceAction.costPrice,
        });
      }
      // Re-read, so the fields and the next comparison start from what was saved.
      setProduct(await getProduct(businessId, current.id));
      setBranchNotice(
        priceAction.kind === 'clear' ? t('editProduct.branchPriceCleared') : t('editProduct.branchPriceSaved')
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    if (!businessId || busy) return;
    // Only the destructive direction asks: withdrawing stops it being sold at
    // every branch. Putting it back is the same button again.
    if (current.isActive) {
      const confirmed = await confirm({
        title: t('editProduct.withdrawTitle', { name: current.name }),
        body: t('editProduct.withdrawBody'),
        confirmLabel: t('editProduct.withdraw'),
        cancelLabel: t('common.cancel'),
      });
      if (!confirmed) return;
    }
    setBusy('active');
    setError(null);
    try {
      const updated = await updateProduct(businessId, current.id, { isActive: !current.isActive });
      setProduct({ ...current, ...updated });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title={current.name} subtitle={t('editProduct.title')} backTo={pathTo('products')} />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      <Enter delay={step(1)}>
        <Card>
          <form onSubmit={saveDetails} noValidate>
            <div className={styles.pills}>
              <Pill
                label={current.branchId ? t('products.branchOnly') : t('editProduct.businessWide')}
                tone={current.branchId ? 'brand' : 'muted'}
              />
              {!current.isActive ? <Pill label={t('editProduct.withdrawn')} tone="warning" /> : null}
            </div>
            <FormInput
              label={t('addProduct.name')}
              icon={IoPricetagOutline}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <FormInput
              label={t('addProduct.unit')}
              icon={IoCubeOutline}
              autoComplete="off"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <div className={fieldStyles.pair}>
              <FormInput
                label={t('editProduct.defaultSell')}
                icon={IoCashOutline}
                inputMode="decimal"
                autoComplete="off"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                error={sellParsed === null ? t('addProduct.invalidNumber') : null}
              />
              <FormInput
                label={t('editProduct.defaultCost')}
                icon={IoTrendingDownOutline}
                inputMode="decimal"
                autoComplete="off"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                error={costParsed === null ? t('addProduct.invalidNumber') : null}
              />
            </div>
            <FormInput
              label={t('addProduct.category')}
              icon={IoFolderOutline}
              autoComplete="off"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <PrimaryButton
              type="submit"
              block
              title={t('editProduct.save')}
              loading={busy === 'details'}
              disabled={!detailsValid || (busy !== null && busy !== 'details')}
            />
          </form>
        </Card>
      </Enter>

      {pricingBranches.length > 0 ? (
        <Enter delay={step(2)}>
          <Card>
            <form onSubmit={saveBranchPrice} noValidate>
              <h2 className={fieldStyles.heading}>{t('editProduct.branchPriceSection')}</h2>
              <p className={fieldStyles.hint}>{t('editProduct.branchPriceHint')}</p>

              {pricingBranches.length > 1 ? (
                <div className={styles.picker}>
                  <BranchPicker
                    name="price-branch"
                    legend={t('products.branchSection')}
                    hideLegend
                    branches={pricingBranches}
                    value={priceBranchId}
                    onChange={setChosenPriceBranchId}
                  />
                </div>
              ) : null}

              <div className={fieldStyles.pair}>
                <FormInput
                  label={t('editProduct.branchSell')}
                  icon={IoCashOutline}
                  inputMode="decimal"
                  autoComplete="off"
                  value={branchSell}
                  onChange={(e) => {
                    setBranchSell(e.target.value);
                    setBranchNotice(null);
                  }}
                />
                <FormInput
                  label={t('editProduct.branchCost')}
                  icon={IoTrendingDownOutline}
                  inputMode="decimal"
                  autoComplete="off"
                  value={branchCost}
                  onChange={(e) => {
                    setBranchCost(e.target.value);
                    setBranchNotice(null);
                  }}
                />
              </div>

              {branchNotice ? (
                <p className={styles.notice} role="status">
                  <IoCheckmarkCircle size={16} aria-hidden="true" />
                  <span>{branchNotice}</span>
                </p>
              ) : null}

              <Button
                type="submit"
                block
                title={priceAction.kind === 'clear' ? t('editProduct.branchPriceClear') : t('editProduct.branchPriceSave')}
                loading={busy === 'price'}
                disabled={priceAction.kind === 'none' || (busy !== null && busy !== 'price')}
              />
            </form>
          </Card>
        </Enter>
      ) : null}

      <Enter delay={step(3)} className={styles.withdraw}>
        <Button
          variant={current.isActive ? 'danger' : 'secondary'}
          icon={current.isActive ? IoEyeOffOutline : IoEyeOutline}
          title={current.isActive ? t('editProduct.withdraw') : t('editProduct.restore')}
          loading={busy === 'active'}
          disabled={busy !== null && busy !== 'active'}
          onClick={() => void toggleActive()}
        />
        <p className={styles.footnote}>{t('editProduct.withdrawHint')}</p>
      </Enter>
    </div>
  );
}
