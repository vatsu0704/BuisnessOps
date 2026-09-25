import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { updatePreferredLocale } from '@/api/auth';
import { LANGUAGES, codeToLocale, persistLanguage, type LanguageCode } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { registerForPush } from '@/utils/push';

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
        // The device already switched; failing to sync the account preference
        // only means other devices keep their current language.
      }
      // Re-register the push token with the new language. The lock screen is
      // the one surface the app cannot re-render, so the server has to be told
      // BEFORE the next notification is composed — otherwise somebody who just
      // switched to Gujarati keeps getting English until the next app launch.
      void registerForPush(code);
    },
    [token]
  );

  const next = useCallback(async () => {
    const index = LANGUAGES.findIndex((l) => l.code === current.code);
    await change(LANGUAGES[(index + 1) % LANGUAGES.length].code);
  }, [current.code, change]);

  return { current, languages: LANGUAGES, change, next };
}
