import { useEffect, useRef } from 'react';

/**
 * The web's `useFocusEffect`: run `refresh` when the page mounts and again
 * whenever the browser tab comes back into view.
 *
 * A page is unmounted when the person navigates away, so mounting covers "came
 * back to this page". What it does not cover is the tab sitting in the
 * background while a cashier rings up sales on a phone — that is the
 * visibility event, the browser's version of the app returning to the
 * foreground.
 */
export function useRefreshOnFocus(refresh: () => unknown) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    void latest.current();
    function onVisibility() {
      if (document.visibilityState === 'visible') void latest.current();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
