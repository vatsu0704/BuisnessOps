import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmark, IoLanguageOutline } from 'react-icons/io5';
import { useDismiss } from '@/hooks/useDismiss';
import { useLanguage } from '@/hooks/useLanguage';
import { cx } from '@/utils/cx';
import styles from './LanguageMenu.module.css';

/**
 * The header's language control. The app's chip cycles to the next language on
 * each tap; with a pointer and four languages a list is quicker, so here it
 * opens one, each language written in its own script.
 */
export default function LanguageMenu({ align = 'right' }: { align?: 'left' | 'right' }) {
  const { t } = useTranslation();
  const { current, languages, change } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close, buttonRef);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.chip}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t('web.language.change')}: ${current.label}`}
      >
        <IoLanguageOutline size={14} aria-hidden="true" />
        <span>{current.short}</span>
      </button>

      {open ? (
        <ul id={menuId} className={cx(styles.menu, align === 'left' && styles.menuLeft)} aria-label={t('language.title')}>
          {languages.map((language) => {
            const selected = language.code === current.code;
            return (
              <li key={language.code}>
                <button
                  type="button"
                  lang={language.code}
                  className={cx(styles.option, selected && styles.optionSelected)}
                  aria-current={selected || undefined}
                  onClick={() => {
                    setOpen(false);
                    void change(language.code);
                    buttonRef.current?.focus();
                  }}
                >
                  <span>{language.label}</span>
                  {selected ? <IoCheckmark size={16} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
