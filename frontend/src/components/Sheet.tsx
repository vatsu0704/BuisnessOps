import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing } from '@/theme';

type Props = {
  visible: boolean;
  title: string;
  /** The sheet never closes itself — the caller decides whether it may. */
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the title, above the scrolling body. The search box lives here. */
  header?: ReactNode;
  footer?: ReactNode;
  /** False while something is in flight that a stray tap must not interrupt. */
  dismissOnScrim?: boolean;
  testID?: string;
};

/**
 * A panel that rises from the bottom over everything else.
 *
 * Four copies of this had accumulated — the language dropdown, the counter's
 * bill and charge sheets, and the new-category box on Add expense — and only
 * two of them got the Android details right. This is the one.
 *
 * Built from React Native's own `Modal`: it renders above everything without a
 * portal, `onRequestClose` gives the Android back button the right behaviour for
 * free, and it needs no dependency.
 *
 * ## The keyboard
 *
 * CLAUDE.md says every screen with an input wraps its scroll view in
 * `KeyboardAvoidingView behavior="padding"`, because edge-to-edge broke
 * `adjustResize`. That rule does **not** work inside a `Modal`: a modal is its
 * own window, which Android does not resize at all, so `KeyboardAvoidingView`
 * there is unreliable. The documented primitive that does work is the `Keyboard`
 * module, so this listens for the keyboard and pads by its height. Note the
 * padding is the keyboard's height *or* the safe-area inset, never their sum:
 * the inset is underneath the keyboard.
 *
 * Not for a centred alert asking one question — that is a different shape, and
 * Add expense's new-category box is deliberately left as one.
 */
export default function Sheet({
  visible,
  title,
  onClose,
  children,
  header,
  footer,
  dismissOnScrim = true,
  testID,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    // Android never fires the `Will` events; iOS fires them early enough to
    // move with the keyboard rather than after it.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
      setKeyboardHeight(0);
    };
  }, [visible]);

  // Leaves the top of the screen showing, so it reads as a panel over the page
  // rather than as a new screen, and shrinks as the keyboard takes the room.
  const maxHeight = windowHeight * 0.82 - keyboardHeight;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping the scrim closes it, as every sheet on this platform does. The
          sheet is itself a Pressable with nothing to do: React Native hands a
          touch to the innermost responder rather than bubbling it, so this is
          what stops a tap on the sheet reaching the scrim behind it and closing
          the thing being tapped. */}
      <Pressable style={styles.scrim} onPress={dismissOnScrim ? onClose : undefined}>
        <Pressable
          testID={testID}
          style={[styles.sheet, { maxHeight, paddingBottom: spacing.xl + (keyboardHeight || insets.bottom) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {header}
          <View style={styles.body}>{children}</View>
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(17, 17, 27, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    ...shadow.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  // Shrinks so a long list scrolls inside the sheet instead of growing it past
  // the screen; a short one still sits at its own height.
  body: { flexShrink: 1 },
});
