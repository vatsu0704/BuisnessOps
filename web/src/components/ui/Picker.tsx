import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoChevronDown, IoSearchOutline } from 'react-icons/io5';
import ChipGroup from '@/components/ui/ChipGroup';
import ChoiceTile from '@/components/ui/ChoiceTile';
import OptionRow from '@/components/ui/OptionRow';
import { useDismiss } from '@/hooks/useDismiss';
import type { PickerOption } from '@shared/types/picker';
import { SEARCH_FROM, filterByQuery, isSearchable } from '@shared/utils/optionSearch';
import { cx } from '@/utils/cx';
import styles from './Picker.module.css';

export type WebPickerOption = PickerOption & { icon?: IconType };

type Props = {
  /** Names the hidden field a form submits, and prefixes the ids. Required. */
  name: string;
  label: string;
  hideLabel?: boolean;
  options: WebPickerOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** The field's leading icon. */
  icon?: IconType;
  /** Shown in the closed field when nothing is chosen. */
  placeholder?: string;
  /** Shown in place of the control when there is nothing to choose from. */
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  /**
   * How the short form draws — whatever the control looked like before it
   * gained a threshold. Rows for a list of choices that each need a sentence,
   * tiles for a few wide ones, chips for a compact filter above a report.
   */
  flatAs?: 'rows' | 'tiles' | 'chips';
  /** Raise the threshold where this control is used at speed. See `SEARCH_FROM`. */
  searchFrom?: number;
};

/**
 * Choose one of many.
 *
 * Under `SEARCH_FROM` options this is the control it has always been — rows or
 * tiles, all visible, one tap. At or above it, it becomes a field that opens a
 * list you type into, because two hundred branches cannot be scanned.
 * The switch lives here so no call site has to decide.
 *
 * ## Why a combobox and not a dialog of radios
 *
 * `OptionRow` is a real `<input type="radio">`, and in a radio group the arrow
 * keys *move the selection*. Arrowing down a filtered list of two hundred
 * branches would fire `onChange` two hundred times — on the Team screen that is
 * two hundred cashier reassignments, and in a form it dirties the draft on every
 * keystroke of navigation. A combobox's `aria-activedescendant` moves without
 * committing, which is the behaviour this needs, and it is what a person expects
 * a dropdown on the web to do.
 *
 * Tab closes **without** committing. The APG allows select-only comboboxes to
 * commit on Tab; these choose records — a branch, a business — and a half-typed
 * query committing as somebody tabs away is how a cashier lands at the wrong shop.
 */
export default function Picker({
  name,
  label,
  hideLabel,
  options,
  value,
  onChange,
  icon: Icon,
  placeholder,
  emptyLabel,
  disabled,
  required,
  flatAs = 'rows',
  searchFrom = SEARCH_FROM,
}: Props) {
  const { t } = useTranslation();
  const base = useId();
  const inputId = `${base}-input`;
  const listId = `${base}-list`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  /**
   * A stored value with no option left to match it still has to show. A business
   * created before this control may hold a country nobody would pick today, and
   * drawing that as "nothing chosen" is how a save quietly wipes it.
   */
  const shown = useMemo(() => {
    if (value === null || options.some((option) => option.value === value)) return options;
    return [{ value, label: value }, ...options];
  }, [options, value]);

  const selected = shown.find((option) => option.value === value) ?? null;
  const matches = useMemo(
    () => filterByQuery(shown, query, (option) => ({ primary: option.label, secondary: option.keywords })),
    [shown, query]
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  useDismiss(wrapRef, open, close, inputRef);

  // Keep the active option inside the list as the arrows move it, and never
  // leave it pointing past the end after the query narrows the matches.
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active, matches]);

  if (options.length === 0 && emptyLabel) return <p className={styles.empty}>{emptyLabel}</p>;

  // --- The short form: every option visible, one tap, as it has always been ---
  if (!isSearchable(shown.length, searchFrom)) {
    if (flatAs === 'chips') {
      return (
        <ChipGroup
          name={name}
          label={label}
          hideLabel={hideLabel}
          value={value}
          onChange={onChange}
          disabled={disabled}
          options={shown.map((option) => ({ value: option.value, label: option.label }))}
        />
      );
    }
    return (
      <fieldset className={cx(styles.flat, flatAs === 'tiles' && styles.flatTiles)}>
        <legend className={cx(styles.legend, hideLabel && 'visually-hidden')}>{label}</legend>
        {shown.map((option) =>
          flatAs === 'tiles' ? (
            <ChoiceTile
              key={option.value}
              name={name}
              value={option.value}
              title={option.label}
              caption={option.description}
              icon={option.icon}
              selected={option.value === value}
              onSelect={() => onChange(option.value)}
            />
          ) : (
            <OptionRow
              key={option.value}
              name={name}
              value={option.value}
              title={option.label}
              description={option.disabled ? (option.disabledReason ?? option.description) : option.description}
              icon={option.icon}
              selected={option.value === value}
              disabled={option.disabled}
              onSelect={() => onChange(option.value)}
            />
          )
        )}
      </fieldset>
    );
  }

  // --- The long form: a combobox over a filtered listbox ---
  function commit(option: WebPickerOption | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      // Any character opens it and starts filtering; the arrows just open it.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // No wrapping: a filtered list of two hundred that jumps back to the top
        // loses the reader's place.
        setActive((at) => Math.min(at + 1, matches.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((at) => Math.max(at - 1, 0));
        break;
      case 'PageDown':
        event.preventDefault();
        setActive((at) => Math.min(at + 10, matches.length - 1));
        break;
      case 'PageUp':
        event.preventDefault();
        setActive((at) => Math.max(at - 10, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(matches.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        // Nothing active commits nothing. Never take the first match on faith —
        // a typo must not silently choose a branch.
        commit(matches[active]);
        break;
      case 'Escape':
        event.preventDefault();
        if (query !== '') setQuery('');
        else close();
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  }

  const activeOption = matches[active];

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label htmlFor={inputId} className={cx(styles.label, hideLabel && 'visually-hidden')}>
        {label}
      </label>

      <div className={cx(styles.field, open && styles.fieldOpen, disabled && styles.fieldDisabled)}>
        <span className={styles.iconBox} aria-hidden="true">
          {open ? <IoSearchOutline size={18} /> : Icon ? <Icon size={18} /> : <IoSearchOutline size={18} />}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          // `text`, not `search`: a search input's own role fights `combobox` in
          // several screen readers, and its clear button sits where the chevron goes.
          type="text"
          role="combobox"
          className={styles.input}
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeOption ? `${listId}-${active}` : undefined}
          disabled={disabled}
          placeholder={open ? t('web.picker.typeToFind') : (selected?.label ?? placeholder ?? t('web.picker.choose'))}
          value={open ? query : (selected?.label ?? '')}
          onChange={(event) => {
            if (!open) setOpen(true);
            setQuery(event.target.value);
          }}
          onMouseDown={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <span className={styles.chevron} aria-hidden="true">
          <IoChevronDown size={16} />
        </span>
      </div>

      {/* What a form submits; the combobox itself is not a form control. */}
      <input type="hidden" name={name} value={value ?? ''} required={required} />

      {open ? (
        <ul className={styles.panel} id={listId} role="listbox" aria-label={label} ref={listRef}>
          {matches.length === 0 ? (
            <li className={styles.noMatch}>{t('web.picker.noMatches', { query })}</li>
          ) : (
            matches.map((option, at) => (
              <li
                key={option.value}
                id={`${listId}-${at}`}
                role="option"
                data-active={at === active}
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                className={cx(
                  styles.option,
                  at === active && styles.optionActive,
                  option.value === value && styles.optionSelected,
                  option.tone === 'warn' && styles.optionWarn,
                  option.disabled && styles.optionDisabled
                )}
                // The pointer must not take focus off the input, or the listbox
                // loses the element `aria-activedescendant` points from.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(at)}
                onClick={() => commit(option)}
              >
                <span className={styles.optionText}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.disabled && option.disabledReason ? (
                    <span className={styles.optionNote}>{option.disabledReason}</span>
                  ) : option.description ? (
                    <span className={styles.optionNote}>{option.description}</span>
                  ) : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}

      <p aria-live="polite" className="visually-hidden">
        {open ? t('web.picker.matchCount', { shown: matches.length, total: shown.length }) : ''}
      </p>
    </div>
  );
}
