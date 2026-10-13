import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * The app's `navigation.goBack()` after a form is saved: back to whichever page
 * opened it — Add branch is reached from Home, Products, Upload and Add staff.
 *
 * A page opened straight from an address (a new tab, a bookmark) has nothing
 * behind it in this app, so it goes to `fallback` instead of out of the site.
 * React Router marks that first entry with the key `"default"`.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== 'default') navigate(-1);
    else navigate(fallback, { replace: true });
  }, [key, navigate, fallback]);
}
