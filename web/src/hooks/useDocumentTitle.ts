import { useEffect } from 'react';
import { APP_NAME } from '@/constants/brand';

/**
 * The browser tab's title: "Home · HisabKitab". `withAppName: false` is for a
 * title that already names the product ("Sign in to HisabKitab").
 */
export function useDocumentTitle(title?: string | null, { withAppName = true } = {}) {
  useEffect(() => {
    if (!title) document.title = APP_NAME;
    else document.title = withAppName ? `${title} · ${APP_NAME}` : title;
  }, [title, withAppName]);
}
