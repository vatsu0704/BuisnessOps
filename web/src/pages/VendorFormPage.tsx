import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  IoAlertCircleOutline,
  IoCheckmark,
  IoEyeOffOutline,
  IoEyeOutline,
  IoLogoWhatsapp,
  IoQrCodeOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { createVendor, updateVendor } from '@/api/supply';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { useVendors } from '@/hooks/useVendors';
import { pathTo } from '@/routes/paths';
import { refreshVendors } from '@/store/vendorStore';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { cx } from '@/utils/cx';
import styles from './FormPage.module.css';
import staffStyles from './StaffForm.module.css';
import vendorStyles from './VendorForm.module.css';

/**
 * Add or edit one third-party vendor — requirement 25, the desk's half (the app's
 * vendor form). A name, and the number the "send to vendor" WhatsApp message goes
 * to. NOT where a payment to them goes: that is shown read-only, because the desk
 * is who notices it is missing, but setting it is accounts' job on Payment QR
 * codes (`paymentAccount:manage`). One page for adding and editing, so the two
 * cannot drift into asking different questions.
 */
export default function VendorFormPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { vendorId } = useParams();
  const goBack = useGoBack(pathTo('vendors'));
  const { vendors, isLoading } = useVendors();
  const vendor = useMemo(() => vendors.find((candidate) => candidate.id === vendorId) ?? null, [vendors, vendorId]);

  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [filledFor, setFilledFor] = useState<string | null>(vendor?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list may still be loading when the page opens: fill the fields the moment
  // the vendor arrives, once, without overwriting what is being typed.
  if (vendor && filledFor !== vendor.id) {
    setFilledFor(vendor.id);
    setName(vendor.name);
    setPhone(vendor.phone ?? '');
  }

  const canSave = name.trim().length > 0 && !isSaving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null };
      if (vendorId) await updateVendor(businessId, vendorId, payload);
      else await createVendor(businessId, payload);
      // Before leaving: the list, the item form and Payment QR codes read one list.
      await refreshVendors();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  /** Withdrawing stops new orders to them, so it asks; bringing them back does not. */
  async function handleToggleActive() {
    if (!businessId || !vendor || isToggling) return;
    if (vendor.isActive) {
      const ok = await confirm({
        title: t('vendors.withdrawTitle', { name: vendor.name }),
        body: t('vendors.withdrawBody'),
        confirmLabel: t('vendors.withdraw'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    setIsToggling(true);
    setError(null);
    try {
      await updateVendor(businessId, vendor.id, { isActive: !vendor.isActive });
      await refreshVendors();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsToggling(false);
    }
  }

  const waiting = !!vendorId && !vendor && isLoading;

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={vendorId ? t('vendors.edit') : t('vendors.add')} backTo={pathTo('vendors')} />

      {waiting ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <>
          {vendor && !vendor.isActive ? (
            <Enter delay={step(1)}>
              <Pill label={t('supply.withdrawn')} tone="muted" />
            </Enter>
          ) : null}

          <Enter delay={step(1)}>
            <Card>
              <FormInput
                label={t('vendors.name')}
                icon={IoStorefrontOutline}
                placeholder={t('vendors.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <FormInput
                label={t('vendors.phone')}
                hint={t('addStaff.optional')}
                icon={IoLogoWhatsapp}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                description={t('vendors.phoneHint')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Card>
          </Enter>

          {vendor ? (
            <Enter delay={step(2)}>
              {/* Read-only on purpose — see the header. */}
              <p className={cx(vendorStyles.payee, !vendor.upiId && vendorStyles.payeeMissing)}>
                {vendor.upiId ? (
                  <IoQrCodeOutline size={18} aria-hidden="true" />
                ) : (
                  <IoAlertCircleOutline size={18} aria-hidden="true" />
                )}
                <span>{vendor.upiId ? t('vendors.paysTo', { upiId: vendor.upiId }) : t('vendors.noUpiYet')}</span>
              </p>
            </Enter>
          ) : null}

          <Enter delay={step(3)} className={styles.submit}>
            {error ? <ErrorBanner key={error} message={error} /> : null}
            <PrimaryButton
              type="submit"
              block
              title={vendorId ? t('vendors.save') : t('vendors.add')}
              icon={IoCheckmark}
              loading={isSaving}
              disabled={!canSave}
            />
            {vendor ? (
              // Withdrawing is the red outline; bringing them back is not a warning.
              <Button
                block
                variant={vendor.isActive ? 'danger' : 'secondary'}
                title={vendor.isActive ? t('vendors.withdraw') : t('vendors.restore')}
                icon={vendor.isActive ? IoEyeOffOutline : IoEyeOutline}
                className={vendor.isActive ? undefined : staffStyles.restore}
                loading={isToggling}
                onClick={() => void handleToggleActive()}
              />
            ) : null}
          </Enter>
        </>
      )}
    </form>
  );
}
