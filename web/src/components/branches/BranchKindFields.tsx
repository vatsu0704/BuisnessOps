import { useTranslation } from 'react-i18next';
import { IoBusinessOutline, IoCubeOutline, IoStorefrontOutline } from 'react-icons/io5';
import ChoiceTile from '@/components/ui/ChoiceTile';
import OptionRow from '@/components/ui/OptionRow';
import type { BranchKind, BranchOperatingModel } from '@/types/branch';
import styles from './BranchFields.module.css';

type Props = {
  kind: BranchKind;
  /** null until chosen: who pays decides whether a cashier is ever asked to, so Add branch never defaults it. */
  operatingModel: BranchOperatingModel | null;
  onKindChange: (kind: BranchKind) => void;
  onModelChange: (model: BranchOperatingModel) => void;
  /** Branch settings explains that the kind can change; Add branch does not need to. */
  kindHint?: string;
  /** Each form says what choosing means at that moment — now, or for the next order. */
  modelHint: string;
  /** Add branch puts a few words under each kind; Branch settings, where it is already known, does not. */
  withCaptions?: boolean;
  /**
   * Requirement 28: company-operated is part of the Franchise plan. False hides
   * the option; `planIncludesFoco` false also says where it lives. Branch
   * settings keeps offering it for a branch that already is one — moving down a
   * plan never takes away what exists.
   */
  offerFoco: boolean;
  planIncludesFoco: boolean;
};

/**
 * What a location is, and — when it is a branch — who pays for its raw material
 * (requirement 24). The first question comes first because it changes what the
 * rest of the form describes; a warehouse orders nothing, so is not asked the second.
 *
 * The two kinds sit side by side as tiles. The two payment models are rows with a
 * sentence each, because the difference between them is a sentence, and "FOCO"
 * on its own tells a new owner nothing.
 */
export default function BranchKindFields({
  kind,
  operatingModel,
  onKindChange,
  onModelChange,
  kindHint,
  modelHint,
  withCaptions,
  offerFoco,
  planIncludesFoco,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend className={styles.heading}>{t('addBranch.kind')}</legend>
        {kindHint ? <p className={styles.hint}>{kindHint}</p> : <div className={styles.legendGap} />}
        <div className={styles.kindGrid}>
          <ChoiceTile
            name="branch-kind"
            value="BRANCH"
            title={t('addBranch.kindBranch')}
            caption={withCaptions ? t('addBranch.kindBranchHint') : undefined}
            icon={IoStorefrontOutline}
            selected={kind === 'BRANCH'}
            onSelect={() => onKindChange('BRANCH')}
          />
          <ChoiceTile
            name="branch-kind"
            value="WAREHOUSE"
            title={t('addBranch.kindWarehouse')}
            caption={withCaptions ? t('addBranch.kindWarehouseHint') : undefined}
            icon={IoCubeOutline}
            selected={kind === 'WAREHOUSE'}
            onSelect={() => onKindChange('WAREHOUSE')}
          />
        </div>
      </fieldset>

      {kind === 'BRANCH' ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.heading}>{t('addBranch.model')}</legend>
          <p className={styles.hint}>{modelHint}</p>
          <div className={styles.modelList}>
            {offerFoco ? (
              <OptionRow
                name="branch-model"
                value="FOCO"
                title={t('addBranch.modelFoco')}
                description={t('addBranch.modelFocoHint')}
                icon={IoBusinessOutline}
                selected={operatingModel === 'FOCO'}
                onSelect={() => onModelChange('FOCO')}
              />
            ) : null}
            <OptionRow
              name="branch-model"
              value="FM"
              title={t('addBranch.modelFm')}
              description={t('addBranch.modelFmHint')}
              icon={IoStorefrontOutline}
              selected={operatingModel === 'FM'}
              onSelect={() => onModelChange('FM')}
            />
          </div>
          {planIncludesFoco ? null : <p className={styles.planNote}>{t('plans.focoOnFranchise')}</p>}
        </fieldset>
      ) : null}
    </>
  );
}
