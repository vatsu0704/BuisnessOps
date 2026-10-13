import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  IoArrowForward,
  IoBarcodeOutline,
  IoBusinessOutline,
  IoCashOutline,
  IoCubeOutline,
  IoFolderOutline,
  IoPricetagOutline,
  IoStorefrontOutline,
  IoTrendingDownOutline,
} from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { createProduct } from '@/api/product';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import BranchPicker from '@/components/branches/BranchPicker';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import OptionRow from '@/components/ui/OptionRow';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { hasCapability } from '@/utils/permissions';
import { parseOptionalNumber } from '@/utils/validation';
import styles from './FormPage.module.css';

/**
 * Add a product — requirement 4, the app's Add product screen.
 *
 * A product belongs to the whole business or to one branch. Somebody who reaches
 * every branch chooses; a cashier is not offered the choice, because the server
 * refuses them the business-wide option and a control that always fails is worse
 * than none.
 */
export default function AddProductPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { tradingBranches: branches } = useBranches();
  const [searchParams] = useSearchParams();

  const canCreateBusinessWide = hasCapability(membership, 'branch:allAccess');
  // The branch the Products page was showing, when this person can reach it.
  const requested = searchParams.get('branch');
  const defaultBranchId = branches.find((b) => b.id === requested)?.id ?? branches[0]?.id ?? null;
  const goBack = useGoBack(defaultBranchId ? `${pathTo('products')}?branch=${defaultBranchId}` : pathTo('products'));

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [scope, setScope] = useState<'BUSINESS' | 'BRANCH'>(canCreateBusinessWide ? 'BUSINESS' : 'BRANCH');
  const [chosenBranchId, setChosenBranchId] = useState<string | null>(null);
  const branchId = chosenBranchId ?? defaultBranchId;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellParsed = parseOptionalNumber(sellPrice);
  const costParsed = parseOptionalNumber(costPrice);

  const canSubmit =
    !!businessId &&
    name.trim() !== '' &&
    unit.trim() !== '' &&
    sellParsed !== null &&
    costParsed !== null &&
    (scope === 'BUSINESS' || !!branchId) &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createProduct(businessId, {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || undefined,
        sku: sku.trim() || undefined,
        sellPrice: sellParsed ?? undefined,
        costPrice: costParsed ?? undefined,
        branchId: scope === 'BRANCH' && branchId ? branchId : undefined,
      });
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={t('addProduct.title')} backTo={pathTo('products')} />

      <Enter delay={step(1)}>
        <Card>
          <FormInput
            label={t('addProduct.name')}
            icon={IoPricetagOutline}
            placeholder={t('addProduct.namePlaceholder')}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FormInput
            label={t('addProduct.unit')}
            description={t('addProduct.unitHint')}
            icon={IoCubeOutline}
            placeholder={t('addProduct.unitPlaceholder')}
            autoComplete="off"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <div className={fieldStyles.pair}>
            <FormInput
              label={t('addProduct.sellPrice')}
              hint={t('addProduct.optional')}
              icon={IoCashOutline}
              inputMode="decimal"
              autoComplete="off"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              error={sellParsed === null ? t('addProduct.invalidNumber') : null}
            />
            <FormInput
              label={t('addProduct.costPrice')}
              hint={t('addProduct.optional')}
              icon={IoTrendingDownOutline}
              inputMode="decimal"
              autoComplete="off"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              error={costParsed === null ? t('addProduct.invalidNumber') : null}
            />
          </div>
          <div className={cx(fieldStyles.pair, fieldStyles.lastPair)}>
            <FormInput
              label={t('addProduct.category')}
              hint={t('addProduct.optional')}
              icon={IoFolderOutline}
              autoComplete="off"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <FormInput
              label={t('addProduct.sku')}
              hint={t('addProduct.optional')}
              icon={IoBarcodeOutline}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>
        </Card>
      </Enter>

      {/* Only offered to somebody who may actually take both options. */}
      {canCreateBusinessWide ? (
        <Enter delay={step(2)}>
          <Card>
            <fieldset className={fieldStyles.fieldset}>
              <legend className={fieldStyles.heading}>{t('addProduct.scopeSection')}</legend>
              <div className={fieldStyles.legendGap} />
              <div className={fieldStyles.modelList}>
                <OptionRow
                  name="product-scope"
                  value="BUSINESS"
                  icon={IoBusinessOutline}
                  title={t('addProduct.scopeBusiness')}
                  description={t('addProduct.scopeBusinessHint')}
                  selected={scope === 'BUSINESS'}
                  onSelect={() => setScope('BUSINESS')}
                />
                <OptionRow
                  name="product-scope"
                  value="BRANCH"
                  icon={IoStorefrontOutline}
                  title={t('addProduct.scopeBranch')}
                  description={t('addProduct.scopeBranchHint')}
                  selected={scope === 'BRANCH'}
                  onSelect={() => setScope('BRANCH')}
                />
              </div>
            </fieldset>
          </Card>
        </Enter>
      ) : null}

      {scope === 'BRANCH' && branches.length > 1 ? (
        <Enter delay={step(3)}>
          <Card>
            <BranchPicker
              name="product-branch"
              legend={t('addProduct.branchSection')}
              branches={branches}
              value={branchId}
              onChange={setChosenBranchId}
            />
          </Card>
        </Enter>
      ) : null}

      <Enter delay={step(4)} className={styles.submit}>
        {error ? <ErrorBanner key={error} message={error} /> : null}
        <PrimaryButton
          type="submit"
          block
          title={isSubmitting ? t('addProduct.submitting') : t('addProduct.submit')}
          icon={IoArrowForward}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
      </Enter>
    </form>
  );
}
