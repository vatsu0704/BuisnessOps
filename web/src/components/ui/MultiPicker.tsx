import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoChevronDown } from 'react-icons/io5';
import CheckChips from '@/components/ui/CheckChips';
import Dialog from '@/components/ui/Dialog';
import SearchField from '@/components/ui/SearchField';
import PrimaryButton from '@/components/ui/PrimaryButton';
import type { WebPickerOption } from '@/components/ui/Picker';
import { SEARCH_FROM, filterByQuery, isSearchable } from '@shared/utils/optionSearch';
import { cx } from '@/utils/cx';
import styles from './MultiPicker.module.css';

type Props = {
  name: string;
  label: string;
  hideLabel?: boolean;
  options: WebPickerOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
  searchFrom?: number;
};

/**
 * Several of many — Invite member's branch grants.
 *
 * Under `SEARCH_FROM` options it is the wrapping row of chips it has always
 * been. Past that it becomes a field showing what is chosen, opening a dialog
 * with a box to type in.
 *
 * ## Why this is a sibling of `Picker` and not a `multiple` prop
 *
 * The value types (`string | null` against `string[]`) cannot be unified without
 * conditional types that break inference at every call site; the closed field is
 * a different control — one label against a count and removable pills; and the
 * two close differently, since picking *is* the interaction for one and must not
 * end it for the other.
 *
 * It is also a **dialog of real checkboxes**, where `Picker` is a combobox. The
 * reason `Picker` cannot use radios is that arrow keys select as they move
 * through a radio group. Checkboxes have no such behaviour, so the simpler,
 * more standard control is the right one here — and `<dialog>` gives the focus
 * trap, Escape and the inert background for nothing.
 */
export default function MultiPicker({
  name,
  label,
  hideLabel,
  options,
  value,
  onChange,
  disabled,
  emptyLabel,
  searchFrom = SEARCH_FROM,
}: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const matches = useMemo(
    () => filterByQuery(options, query, (option) => ({ primary: option.label, secondary: option.keywords })),
    [options, query]
  );
  const chosen = options.filter((option) => value.includes(option.value));

  function toggle(optionValue: string) {
    onChange(
      value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue]
    );
  }

  if (options.length === 0 && emptyLabel) return <p className={styles.empty}>{emptyLabel}</p>;

  if (!isSearchable(options.length, searchFrom)) {
    return (
      <CheckChips
        label={label}
        hideLabel={hideLabel}
        disabled={disabled}
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
          disabled: option.disabled,
        }))}
        selected={value}
        onToggle={toggle}
      />
    );
  }

  function close() {
    setIsOpen(false);
    setQuery('');
  }

  return (
    <div className={styles.wrap}>
      <span className={cx(styles.label, hideLabel && 'visually-hidden')} id={`${name}-label`}>
        {label}
      </span>

      <button
        type="button"
        className={styles.field}
        disabled={disabled}
        aria-labelledby={`${name}-label`}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
      >
        <span className={styles.fieldText}>
          {chosen.length === 0
            ? t('web.picker.none')
            : t('web.picker.selectedCount', { selected: chosen.length, total: options.length })}
        </span>
        <IoChevronDown size={16} aria-hidden="true" />
      </button>

      {/* What is chosen stays readable without opening anything, and each one
          comes off where it sits — the shape the Team screen's branch grants
          already use. */}
      {chosen.length > 0 ? (
        <ul className={styles.pills}>
          {chosen.map((option) => (
            <li key={option.value} className={styles.pill}>
              <span>{option.label}</span>
              <button
                type="button"
                className={styles.pillRemove}
                disabled={disabled}
                aria-label={t('web.picker.removeOne', { name: option.label })}
                onClick={() => toggle(option.value)}
              >
                <IoCloseOutline size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={isOpen}
        title={label}
        onClose={close}
        footer={<PrimaryButton block title={t('web.picker.done')} onClick={close} />}
      >
        <div className={styles.panel}>
          <SearchField label={t('web.picker.typeToFind')} value={query} onChange={setQuery} />
          {matches.length === 0 ? (
            <p className={styles.noMatch}>{t('web.picker.noMatches', { query })}</p>
          ) : (
            <ul className={styles.list}>
              {matches.map((option) => (
                <li key={option.value}>
                  <label className={cx(styles.row, value.includes(option.value) && styles.rowOn)}>
                    <input
                      type="checkbox"
                      name={name}
                      value={option.value}
                      checked={value.includes(option.value)}
                      disabled={option.disabled}
                      onChange={() => toggle(option.value)}
                    />
                    <span className={styles.rowText}>
                      <span className={styles.rowLabel}>{option.label}</span>
                      {option.description ? <span className={styles.rowNote}>{option.description}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
}
