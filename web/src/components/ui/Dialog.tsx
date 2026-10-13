import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import styles from './Dialog.module.css';

type Props = {
  open: boolean;
  title: string;
  /** Escape, a click on the backdrop, or a close button inside. */
  onClose: () => void;
  children: ReactNode;
  /** Buttons, laid out at the foot — stacked on a narrow window. */
  footer?: ReactNode;
  size?: 'sm' | 'md';
};

/**
 * A modal on the browser's own `<dialog>` element: `showModal()` traps focus,
 * puts everything behind it out of reach of the keyboard and screen readers, and
 * Escape closes it — the three things the app gets from its native dialogs and a
 * hand-built overlay would have to re-earn.
 */
export default function Dialog({ open, title, onClose, children, footer, size = 'sm' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, size === 'md' && styles.md)}
      aria-labelledby={titleId}
      // Escape fires `cancel`; the parent decides what closing means.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // The dialog element is the backdrop's hit area; its content is a child.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.body}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div className={styles.content}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  );
}
