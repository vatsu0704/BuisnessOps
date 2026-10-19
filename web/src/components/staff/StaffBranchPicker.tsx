import { useTranslation } from 'react-i18next';
import { IoCubeOutline, IoStorefrontOutline } from 'react-icons/io5';
import BranchPicker from '@/components/branches/BranchPicker';
import type { Branch } from '@/types/branch';

/**
 * Where a staff member is based, on Add staff and Edit staff — every location,
 * warehouses included, each tile saying which kind it is and where. The app's two
 * grids of `SegmentedOption`s with the same caption.
 */
export default function StaffBranchPicker({
  name,
  legend,
  branches,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  branches: Branch[];
  value: string | null;
  onChange: (branchId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <BranchPicker
      name={name}
      legend={legend}
      hideLegend
      branches={branches}
      value={value}
      onChange={onChange}
      caption={(branch) =>
        [branch.kind === 'WAREHOUSE' ? t('addBranch.kindWarehouse') : branch.code, branch.city]
          .filter(Boolean)
          .join(' · ')
      }
      icon={(branch) => (branch.kind === 'WAREHOUSE' ? IoCubeOutline : IoStorefrontOutline)}
    />
  );
}
