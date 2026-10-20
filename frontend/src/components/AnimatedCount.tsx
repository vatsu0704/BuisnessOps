import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  formatValue?: (value: number) => string;
  /**
   * Keep the figure on one line, shrinking the type until it fits rather than
   * wrapping. A rupee figure broken across two lines is unreadable, and the
   * figures these tiles hold grow without bound — ₹20,000 already wrapped in a
   * third of a 320dp screen.
   */
  fitOneLine?: boolean;
  /** How far `fitOneLine` may shrink before it stops. */
  minimumFontScale?: number;
};

export default function AnimatedCount({
  value,
  duration = 700,
  style,
  formatValue,
  fitOneLine = false,
  minimumFontScale = 0.6,
}: Props) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = Date.now();
    let frame: number;

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <Text
      style={style}
      numberOfLines={fitOneLine ? 1 : undefined}
      adjustsFontSizeToFit={fitOneLine}
      minimumFontScale={fitOneLine ? minimumFontScale : undefined}
    >
      {formatValue ? formatValue(display) : display}
    </Text>
  );
}
