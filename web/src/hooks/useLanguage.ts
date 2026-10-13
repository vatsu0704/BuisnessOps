import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { updatePreferredLocale } from '@/api/auth';
import { LANGUAGES, codeToLocale, persistLanguage, type LanguageCode } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

/**
 * The language showing now, and a way to change it. A change is remembered in
 * this browser and, when signed in, saved to the account so the phone follows.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const token = useAuthStore((s) => s.token);

  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const change = useCallback(
    async (code: LanguageCode) => {
      await persistLanguage(code);
      if (!token) return;
      try {
        await updatePreferredLocale(codeToLocale(code));
      } catch {
        // This browser already switched; failing to sync only means other
        // devices keep their current language.
      }
    },
    [token]
  );

  return { current, languages: LANGUAGES, change };
}
