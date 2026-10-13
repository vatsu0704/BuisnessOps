import { useTranslation } from 'react-i18next';
import Card from '@/components/ui/Card';
import OptionRow from '@/components/ui/OptionRow';
import { useLanguage } from '@/hooks/useLanguage';
import styles from './Settings.module.css';

/**
 * The language, as a list — each in its own script, with its English name under
 * it. The app opens this list in a sheet from a closed field; a page has room to
 * show the four rows themselves, which is one click fewer.
 */
export default function LanguageSelector() {
  const { t } = useTranslation();
  const { current, languages, change } = useLanguage();

  return (
    <Card title={t('language.title')}>
      <div className={styles.options} role="radiogroup" aria-label={t('language.title')}>
        {languages.map((language) => (
          <OptionRow
            key={language.code}
            name="language"
            value={language.code}
            title={language.label}
            description={t(`language.${language.code}`)}
            selected={language.code === current.code}
            onSelect={() => void change(language.code)}
          />
        ))}
      </div>
    </Card>
  );
}
