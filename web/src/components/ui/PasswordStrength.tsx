import { useTranslation } from 'react-i18next';
import styles from './PasswordStrength.module.css';

const SEGMENTS = 4;

type LabelKey = 'password.tooShort' | 'password.weak' | 'password.good' | 'password.strong';
type HintKey = 'password.hintShort' | 'password.hintVariety' | 'password.hintLength' | 'password.hintVaried';

type Strength = { score: number; labelKey: LabelKey | null; hintKey: HintKey | null; color: string };

/** The app's scoring, unchanged, so a password rates the same on the phone and here. */
export function scorePassword(password: string): Strength {
  if (password.length === 0) return { score: 0, labelKey: null, hintKey: null, color: 'var(--color-border)' };
  if (password.length < 8) {
    return { score: 1, labelKey: 'password.tooShort', hintKey: 'password.hintShort', color: 'var(--color-error)' };
  }

  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (variety <= 1) {
    return { score: 2, labelKey: 'password.weak', hintKey: 'password.hintVariety', color: 'var(--color-warning)' };
  }
  if (variety === 2 || password.length < 12) {
    return { score: 3, labelKey: 'password.good', hintKey: 'password.hintLength', color: 'var(--color-primary)' };
  }
  return { score: 4, labelKey: 'password.strong', hintKey: 'password.hintVaried', color: 'var(--color-success)' };
}

export default function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const { score, labelKey, hintKey, color } = scorePassword(password);

  if (password.length === 0) return null;

  return (
    <div className={styles.wrap} aria-live="polite">
      <div className={styles.header}>
        <span className={styles.caption}>{t('password.level')}</span>
        <span className={styles.value} style={{ color }}>
          {labelKey ? t(labelKey) : ''}
          {hintKey ? <span className={styles.hint}>{`  ·  ${t(hintKey)}`}</span> : null}
        </span>
      </div>
      <div className={styles.track} aria-hidden="true">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={styles.segment}
            style={{
              background: i < score ? color : undefined,
              opacity: i < score ? 1 : undefined,
              transitionDelay: `${i * 40}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
