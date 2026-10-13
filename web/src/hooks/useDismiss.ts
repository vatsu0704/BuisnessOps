import { useEffect, type RefObject } from 'react';

/**
 * Close a popover the way people expect: a click or tap outside it, or Escape.
 * Escape also hands focus back to the button that opened it.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  returnFocusTo?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        returnFocusTo?.current?.focus();
      }
    }

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, onClose, returnFocusTo]);
}
