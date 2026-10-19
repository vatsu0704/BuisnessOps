import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  IoCheckmark,
  IoCubeOutline,
  IoEyeOffOutline,
  IoEyeOutline,
  IoFolderOutline,
  IoPricetagOutline,
  IoScaleOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { createSupplyItem, listSupplyItems, updateSupplyItem } from '@/api/supply';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import OptionRow from '@/components/ui/OptionRow';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { useVendors } from '@/hooks/useVendors';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { SupplyItem } from '@/types/supply';
import { confirm } from '@/utils/confirm';
import { hasPlanFeature } from '@/utils/permissions';
import styles from './FormPage.module.css';
import staffStyles from './StaffForm.module.css';

/**
 * Add or edit one thing the warehouse supplies — the app's item form, one page
 * for both because the fields are the same.
 *
 * An empty price is allowed and means something: an item with no price cannot
 * be ordered, which is different from one that has been withdrawn. The first
 * says "we have not settled on a price"; the second, "we no longer supply this".
 *
 * "Supplied by" is who the branch is really ordering from (requirement 25) —
 * the warehouse's own stock or a vendor — as stacked rows, because the number of
 * vendors grows with the business and a vendor's name is any length.
 */
export default function SupplyItemFormPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { inventoryItemId } = useParams();
  const isEdit = !!inventoryItemId;
  const goBack = useGoBack(pathTo('supply'));

  const [item, setItem] = useState<SupplyItem | null>(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  // null is the warehouse's own stock.
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { activeVendors: allActiveVendors } = useVendors();
  // Naming a vendor as a supplier is part of Franchise (requirement 28). On a
  // lower plan an item keeps the vendor it already has and can be moved back to
  // the warehouse; no other vendor is offered.
  const canChooseVendors = hasPlanFeature(membership, 'vendors');
  const activeVendors = canChooseVendors
    ? allActiveVendors
    : allActiveVendors.filter((vendor) => vendor.id === item?.vendorId);

  useEffect(() => {
    if (!businessId || !inventoryItemId) return;
    let live = true;
    setIsLoading(true);
    // There is no single-item read: the list is small, and asking for it with the
    // withdrawn ones is the only way an edit of a withdrawn item finds it.
    listSupplyItems(businessId, { includeInactive: true })
      .then((all) => {
        if (!live) return;
        const found = all.find((candidate) => candidate.id === inventoryItemId) ?? null;
        setItem(found);
        if (found) {
          setName(found.name);
          setUnit(found.unit);
          setCategory(found.category ?? '');
          setPrice(found.unitPrice === null ? '' : String(Number(found.unitPrice)));
          setVendorId(found.vendorId);
        }
      })
      .catch((err: unknown) => {
        if (live) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [businessId, inventoryItemId]);

  /** Empty is "no price", a value here rather than a missing one. */
  function parsePrice(): number | null {
    const trimmed = price.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  const canSave = name.trim().length > 0 && unit.trim().length > 0 && !isSaving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || null,
        unitPrice: parsePrice(),
        vendorId,
      };
      if (inventoryItemId) await updateSupplyItem(businessId, inventoryItemId, payload);
      else await createSupplyItem(businessId, payload);
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!businessId || !item || isToggling) return;
    // Only the destructive direction asks. Withdrawing takes an item off every
    // branch's order list at once; putting it back is the same button again.
    if (item.isActive) {
      const ok = await confirm({
        title: t('supply.withdrawTitle', { name: item.name }),
        body: t('supply.withdrawBody'),
        confirmLabel: t('supply.withdraw'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    setIsToggling(true);
    setError(null);
    try {
      setItem(await updateSupplyItem(businessId, item.id, { isActive: !item.isActive }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsToggling(false);
    }
  }

  const title = isEdit ? t('supply.editItem') : t('supply.addItem');
  // Asked only once there is somebody other than the warehouse to choose. An item
  // whose vendor has since been withdrawn keeps showing them, so saving does not
  // quietly move it back to the warehouse.
  const withdrawnVendor =
    vendorId && item?.vendor && !activeVendors.some((vendor) => vendor.id === vendorId) ? item.vendor : null;
  const askSupplier = activeVendors.length > 0 || !!withdrawnVendor;

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={title} backTo={pathTo('supply')} />

      {isLoading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <>
          {item && !item.isActive ? (
            <Enter delay={step(1)}>
              <Pill label={t('supply.withdrawn')} tone="muted" />
            </Enter>
          ) : null}

          <Enter delay={step(1)}>
            <Card>
              <FormInput label={t('supply.itemName')} icon={IoCubeOutline} value={name} onChange={(e) => setName(e.target.value)} />
              <FormInput
                label={t('supply.itemUnit')}
                hint={t('supply.itemUnitHint')}
                icon={IoScaleOutline}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
              <FormInput
                label={t('supply.itemCategory')}
                icon={IoFolderOutline}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <FormInput
                label={t('supply.itemPrice')}
                hint={t('supply.noteOptional')}
                icon={IoPricetagOutline}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Card>
          </Enter>

          {askSupplier ? (
            <Enter delay={step(2)}>
              <Card>
                <fieldset className={fieldStyles.fieldset}>
                  <legend className={fieldStyles.heading}>{t('supply.suppliedBy')}</legend>
                  <div className={fieldStyles.legendGap} />
                  <div className={fieldStyles.modelList}>
                    <OptionRow
                      name="supply-item-supplier"
                      value=""
                      icon={IoCubeOutline}
                      title={t('supply.warehouseStock')}
                      description={t('supply.warehouseStockHint')}
                      selected={vendorId === null}
                      onSelect={() => setVendorId(null)}
                    />
                    {activeVendors.map((vendor) => (
                      <OptionRow
                        key={vendor.id}
                        name="supply-item-supplier"
                        value={vendor.id}
                        icon={IoStorefrontOutline}
                        title={vendor.name}
                        description={t('supply.vendorSuppliesHint')}
                        selected={vendorId === vendor.id}
                        onSelect={() => setVendorId(vendor.id)}
                      />
                    ))}
                    {withdrawnVendor ? (
                      <OptionRow
                        name="supply-item-supplier"
                        value={withdrawnVendor.id}
                        icon={IoStorefrontOutline}
                        title={withdrawnVendor.name}
                        description={t('supply.vendorWithdrawnHint')}
                        selected
                        onSelect={() => undefined}
                      />
                    ) : null}
                  </div>
                </fieldset>
              </Card>
            </Enter>
          ) : null}

          <Enter delay={step(3)} className={styles.submit}>
            {error ? <ErrorBanner key={error} message={error} /> : null}
            <PrimaryButton type="submit" block title={title} icon={IoCheckmark} loading={isSaving} disabled={!canSave} />
            {item ? (
              <>
                {/* Withdrawing is the red outline; supplying it again is not a warning. */}
                <Button
                  block
                  variant={item.isActive ? 'danger' : 'secondary'}
                  title={item.isActive ? t('supply.withdraw') : t('supply.restore')}
                  icon={item.isActive ? IoEyeOffOutline : IoEyeOutline}
                  className={item.isActive ? undefined : staffStyles.restore}
                  loading={isToggling}
                  onClick={() => void handleToggleActive()}
                />
                <p className={styles.footnote}>{t('supply.itemActiveHint')}</p>
              </>
            ) : null}
          </Enter>
        </>
      )}
    </form>
  );
}
