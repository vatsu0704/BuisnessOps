import { create } from 'zustand';

/**
 * Ask before doing something that cannot be taken back — the app's
 * `utils/confirm.ts`, with the same options and the same promise, so a caller
 * reads `if (await confirm({...}))` on both.
 *
 * Only the destructive direction asks: withdrawing a product asks, restoring it
 * does not. Every string is passed in already translated.
 *
 * Rendered by the one `ConfirmHost` mounted in `App`, on the browser's `<dialog>`.
 */
export type ConfirmOptions = {
  title: string;
  body: string;
  /** The label on the button that goes ahead — "Cancel order", "Withdraw". */
  confirmLabel: string;
  /** The label that backs out. Callers pass `t('common.cancel')`. */
  cancelLabel: string;
  /** Red when going ahead destroys something; true unless said otherwise. */
  destructive?: boolean;
};

type Pending = { options: ConfirmOptions; resolve: (answer: boolean) => void };

export const useConfirmStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Resolves true when the person confirms, false when they back out or dismiss. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A second question while one is open answers the first with "no" rather
    // than leaving its caller waiting for ever.
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({ pending: { options, resolve } });
  });
}

/** Called by ConfirmHost with the answer. */
export function settleConfirm(answer: boolean) {
  const { pending } = useConfirmStore.getState();
  if (!pending) return;
  useConfirmStore.setState({ pending: null });
  pending.resolve(answer);
}
