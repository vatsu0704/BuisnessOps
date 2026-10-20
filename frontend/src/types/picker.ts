/**
 * One choosable thing, as both apps' pickers take it.
 *
 * Deliberately without an icon: the app names one as a key of Ionicons' glyph
 * map and the web as a react-icons component, and there is no type both can
 * hold. Each app widens this with its own — the same split `constants/industries`
 * already lives with.
 */
export interface PickerOption {
  value: string;
  /** What the person reads. */
  label: string;
  /** The sentence under it — a branch's city, who already holds it. */
  description?: string;
  /**
   * Matched when searching but not shown: a branch's code, a country's other
   * names. Nulls are ignored, so a caller can pass optional fields straight in.
   */
  keywords?: readonly (string | null | undefined)[];
  /** Cannot be chosen now. */
  disabled?: boolean;
  /**
   * Why not. Shown beside the option rather than hidden — a control somebody
   * holds the capability for must say what the rule is, not merely grey out
   * (requirement 19).
   */
  disabledReason?: string;
  /**
   * Choosable, but worth marking — a branch another cashier already holds. The
   * picker draws it differently and knows nothing about what it means.
   */
  tone?: 'default' | 'warn';
}
