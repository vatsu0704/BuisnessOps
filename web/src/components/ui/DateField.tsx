import type { InputHTMLAttributes } from 'react';
import { IoCalendarOutline } from 'react-icons/io5';
import { todayISO } from '@/utils/date';
import FormInput from './FormInput';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  label: string;
  /** YYYY-MM-DD — the form the API takes and `<input type="date">` gives. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  /** Defaults to today, as the app's DateField does: these record what happened. */
  max?: string | null;
  hint?: string;
  error?: string | null;
};

/**
 * A date, through the browser's own date input — the web's equivalent of the
 * app's native picker. Pass `max={null}` for a date that may be in the future
 * (a holiday being planned).
 */
export default function DateField({ label, value, onChange, min, max, ...rest }: Props) {
  return (
    <FormInput
      label={label}
      icon={IoCalendarOutline}
      type="date"
      value={value}
      min={min}
      max={max === null ? undefined : (max ?? todayISO())}
      onChange={(event) => onChange(event.target.value)}
      {...rest}
    />
  );
}
