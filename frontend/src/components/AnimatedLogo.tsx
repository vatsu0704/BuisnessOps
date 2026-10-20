import { useEffect, useRef } from 'react';
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import BrandMark, { markHeight } from '@/components/BrandMark';
import Wordmark from '@/components/Wordmark';
import { spring, step } from '@/theme/motion';

/** The wordmark's size and the gap, as fractions of the mark's width. */
export const NAME_SIZE = 0.295;
export const NAME_GAP = 0.09;
/** The name arrives behind the last streak — `BrandMark` starts that at step(3.5). */
export const NAME_AT = step(6);

type Props = {
  /** The mark's width in dp. The name is sized from it. */
  size: number;
  /** false shows the finished lockup with no draw-in. */
  autoplay?: boolean;
  /** Called once the whole sequence has finished, the name included. */
  onFinish?: () => void;
  /**
   * How much the lockup has to rise to end up centred as a group, reported once
   * the name has laid out. The splash starts the lockup lowered by this so the
   * mark alone sits where the native splash drew it.
   */
  onNameHeight?: (lift: number) => void;
  /** Extra content under the name — the splash's tagline. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The mark and the name, drawn in once.
 *
 * The one place the full lockup animates, so the splash and anything else that
 * wants it stay in step. `BrandMark` owns the mark's own sequence — the K, the
 * P, then the four streaks behind them — and this adds the name beneath it and
 * says when the whole thing has finished.
 */
export default function AnimatedLogo({ size, autoplay = true, onFinish, onNameHeight, children, style }: Props) {
  const gap = Math.round(size * NAME_GAP);
  const reveal = useSharedValue(autoplay ? 0 : 1);
  const done = useRef(onFinish);
  done.current = onFinish;

  useEffect(() => {
    if (!autoplay) {
      done.current?.();
      return;
    }
    reveal.value = withDelay(
      NAME_AT,
      withSpring(1, spring.gentle, (finished) => {
        if (finished && done.current) runOnJS(done.current)();
      })
    );
  }, [autoplay, reveal]);

  const nameStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value),
    transform: [{ translateY: (1 - reveal.value) * 14 }],
  }));

  function measure(event: LayoutChangeEvent) {
    onNameHeight?.((event.nativeEvent.layout.height + gap) / 2);
  }

  return (
    <Animated.View style={[styles.lockup, style]}>
      <BrandMark width={size} />
      <Animated.View style={[styles.name, { marginTop: gap }, nameStyle]} onLayout={measure}>
        <Wordmark size={Math.round(size * NAME_SIZE)} align="center" />
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** The lockup's full height at this size, for a caller reserving the space. */
export function lockupHeight(size: number): number {
  return markHeight(size) + Math.round(size * NAME_GAP) + Math.round(size * NAME_SIZE) * 1.15;
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center' },
  name: { alignItems: 'center' },
});
