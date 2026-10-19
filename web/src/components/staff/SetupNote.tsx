import { Link } from 'react-router';
import type { IconType } from 'react-icons';
import { IoAdd } from 'react-icons/io5';
import styles from './SetupNote.module.css';

/**
 * What the base question says when it has nothing correct to offer — no branch
 * at all, or the warehouse desk at a business with no warehouse — and the way out
 * of it for someone who may take it. The app's Add staff `SetupNote`.
 *
 * Stacked, never a sentence beside a button: every Indic translation of both runs
 * longer than the English, and a row would squeeze the sentence first.
 */
export default function SetupNote({
  icon: Icon,
  text,
  action,
}: {
  icon: IconType;
  text: string;
  action: { label: string; to: string } | null;
}) {
  return (
    <div className={styles.note}>
      <p className={styles.row}>
        <Icon size={18} aria-hidden="true" />
        <span>{text}</span>
      </p>
      {action ? (
        <Link to={action.to} className={styles.action}>
          <IoAdd size={16} aria-hidden="true" />
          <span>{action.label}</span>
        </Link>
      ) : null}
    </div>
  );
}
