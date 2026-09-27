import { Alert, Platform } from 'react-native';

/**
 * Ask before doing something that cannot be taken back.
 *
 * Three screens had already written this same `Alert.alert(title, body, [cancel,
 * destructive])` by hand, and three more destructive actions had no question at
 * all — cancelling a supply order, withdrawing a product, withdrawing a raw
 * material. One helper means a new destructive action is one line rather than a
 * shape to remember, and it is the same shape everywhere.
 *
 * `Alert` is React Native's own API and the right one here: it is the platform
 * dialog, it traps focus, and the hardware back button dismisses it. A custom
 * modal would have to re-earn all three.
 *
 * **Every string is passed in, already translated.** This file renders nothing
 * of its own, so there is no English hiding in a utility where `lint:i18n`
 * cannot see it.
 */

export type ConfirmOptions = {
  title: string;
  body: string;
  /** The label on the button that goes ahead — "Cancel order", "Withdraw". */
  confirmLabel: string;
  /** The label that backs out. Callers pass `t('common.cancel')`. */
  cancelLabel: string;
  /**
   * Whether going ahead is destructive. iOS colours that button red and
   * Android's dialog reads it out as the weightier choice; it is true for
   * everything that uses this today, and stays a parameter rather than an
   * assumption so a merely-irreversible action can say false.
   */
  destructive?: boolean;
};

/**
 * Resolves true when the person confirms and false when they back out or
 * dismiss — so a caller reads as `if (await confirm(...))` rather than as a
 * pair of callbacks.
 */
export function confirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
}: ConfirmOptions): Promise<boolean> {
  // react-native-web has no Alert implementation, and the browser's own
  // confirm() is the equivalent platform dialog there. Same shape as
  // utils/haptics.ts, which no-ops on web for the same reason.
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`${title}\n\n${body}`)
        : true
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      body,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      // `onDismiss` catches the Android back button and a tap outside, neither
      // of which fires either button. Without it the promise never settles and
      // whatever the caller did with a busy flag stays stuck.
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
