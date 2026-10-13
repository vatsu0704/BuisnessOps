import { useId, useState, type DragEvent } from 'react';
import { IoCloudUploadOutline, IoDocumentText } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './FileDrop.module.css';

type Props = {
  /** What the browser's file dialog offers — extensions and types, as `<input accept>` takes them. */
  accept: string;
  file: File | null;
  onFile: (file: File) => void;
  /** Before a file: what to choose. */
  title: string;
  /** Before a file: the limit or the formats. */
  hint: string;
  /** After a file: how to replace it. */
  changeHint: string;
  disabled?: boolean;
};

/**
 * Choose a file, or drop one on it — the web's version of the app's document
 * picker. A real file input underneath, so it is reached with Tab and opened with
 * Enter or Space, and a screen reader hears what it is.
 *
 * `accept` filters the dialog but not a drop, so the caller checks what it is
 * given.
 */
export default function FileDrop({ accept, file, onFile, title, hint, changeHint, disabled }: Props) {
  const id = useId();
  const [isOver, setIsOver] = useState(false);

  function onDragOver(event: DragEvent) {
    if (disabled) return;
    // Without this the browser opens the dropped file itself, leaving the page.
    event.preventDefault();
    setIsOver(true);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setIsOver(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  }

  const Icon = file ? IoDocumentText : IoCloudUploadOutline;

  return (
    <label
      htmlFor={id}
      className={cx(styles.zone, isOver && styles.over, !!file && styles.chosen, disabled && styles.disabled)}
      onDragOver={onDragOver}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="visually-hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onFile(chosen);
          // Cleared, so choosing the same file again — after fixing it — still counts.
          event.target.value = '';
        }}
      />
      <Icon size={26} className={styles.icon} aria-hidden="true" />
      <span className={styles.title}>{file ? file.name : title}</span>
      <span className={styles.hint}>{file ? changeHint : hint}</span>
    </label>
  );
}
