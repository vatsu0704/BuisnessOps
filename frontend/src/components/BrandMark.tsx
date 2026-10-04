import { useEffect, useId } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import art from '@/constants/brandMark.json';
import { duration, spring, step } from '@/theme/motion';

/**
 * The HisabKitab mark: the H's two stems, the ribbon that is both the H's
 * crossbar and the K's lower leg, and the K's arm.
 *
 * It is drawn from constants/brandMark.json, the same geometry that
 * scripts/generate-brand-assets.js renders into the launcher icon and the
 * splash, so the in-app logo and the icon cannot drift apart.
 *
 * It draws itself in the order a hand would write it — the stems rise off the
 * baseline, the ribbon sweeps across them left to right, then the arm flicks
 * out. Each part is its own layer and every step is a transform or an opacity,
 * so the whole sequence runs on the UI thread.
 */

type Paint = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  userSpace?: boolean;
  stops: { offset: number; color: string }[];
};
type Part = { box: number[]; paths: { d: string; paint?: string }[] };

const PAINTS: Record<string, Paint> = art.paints;
const PARTS: Record<'leftStem' | 'rightStem' | 'ribbon' | 'arm', Part> = art.parts;

/** Height of the mark when it is drawn `width` wide. */
export function markHeight(width: number): number {
  return (width * art.height) / art.width;
}

function layerStyle(box: number[], scale: number): ViewStyle {
  const [x, y, w, h] = box;
  return { position: 'absolute', left: x * scale, top: y * scale, width: w * scale, height: h * scale };
}

/**
 * One part, drawn into exactly its own box.
 *
 * `uid` keeps its gradient ids unique in the document. On native each Svg is its
 * own namespace, but on web they share the page's, and `url(#id)` resolves to
 * the first match anywhere in it: a screen hidden underneath in the stack, still
 * holding a mark of its own, would hand over a gradient that is not rendered,
 * and every part filled with it would vanish.
 */
function PartArt({ part, scale, uid }: { part: Part; scale: number; uid: string }) {
  const [x, y, w, h] = part.box;
  const paints = [...new Set(part.paths.flatMap((p) => (p.paint ? [p.paint] : [])))];

  return (
    <Svg width={w * scale} height={h * scale} viewBox={`${x} ${y} ${w} ${h}`}>
      <Defs>
        {paints.map((name) => {
          const paint = PAINTS[name];
          return (
            <LinearGradient
              key={name}
              id={`${uid}-${name}`}
              x1={paint.x1}
              y1={paint.y1}
              x2={paint.x2}
              y2={paint.y2}
              gradientUnits={paint.userSpace ? 'userSpaceOnUse' : 'objectBoundingBox'}
            >
              {paint.stops.map((stop) => (
                <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </LinearGradient>
          );
        })}
      </Defs>
      {part.paths.map((path, index) => (
        <Path key={index} d={path.d} fill={path.paint ? `url(#${uid}-${path.paint})` : art.blue} />
      ))}
    </Svg>
  );
}

type LayerProps = { part: Part; scale: number; delay: number; uid: string };

/** A stem rising off the baseline into place. */
function Stem({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [delay, progress]);

  const rise = part.box[3] * scale * 0.18;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.6),
    transform: [{ translateY: (1 - progress.value) * rise }],
  }));

  return (
    <Animated.View style={[layerStyle(part.box, scale), animatedStyle]}>
      <PartArt part={part} scale={scale} uid={uid} />
    </Animated.View>
  );
}

/**
 * The ribbon, revealed by a window sliding left to right across it. The window
 * clips (overflow hidden) and moves one way while the drawing inside moves the
 * other, so the drawing stays put and only the window's edge travels — a wipe
 * made of two translations.
 */
function Ribbon({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: duration.slow, easing: Easing.out(Easing.cubic) }));
  }, [delay, progress]);

  const width = part.box[2] * scale;
  const windowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - progress.value) * width }] }));
  const artStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - progress.value) * width }] }));

  return (
    <Animated.View style={[layerStyle(part.box, scale), styles.clip, windowStyle]}>
      <Animated.View style={artStyle}>
        <PartArt part={part} scale={scale} uid={uid} />
      </Animated.View>
    </Animated.View>
  );
}

/** The K's arm, growing out from its lower-left end, where it leaves the stem. */
function Arm({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
  }, [delay, progress]);

  const halfW = (part.box[2] * scale) / 2;
  const halfH = (part.box[3] * scale) / 2;
  const animatedStyle = useAnimatedStyle(() => {
    const s = 0.35 + 0.65 * progress.value;
    // A scale pivots on the centre; shifting by the pivot's offset times (1 - s)
    // pins the lower-left corner instead.
    return {
      opacity: Math.min(1, progress.value * 2),
      transform: [{ translateX: -halfW * (1 - s) }, { translateY: halfH * (1 - s) }, { scale: s }],
    };
  });

  return (
    <Animated.View style={[layerStyle(part.box, scale), animatedStyle]}>
      <PartArt part={part} scale={scale} uid={uid} />
    </Animated.View>
  );
}

type Props = { width?: number; delay?: number };

export default function BrandMark({ width = 44, delay = 0 }: Props) {
  const scale = width / art.width;
  // useId's colons are not valid inside a url(#…) reference.
  const uid = `brandMark${useId().replace(/:/g, '')}`;
  const settle = useSharedValue(0.94);

  useEffect(() => {
    settle.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [delay, settle]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: settle.value }] }));

  return (
    <Animated.View style={[{ width, height: markHeight(width) }, animatedStyle]}>
      <Stem part={PARTS.leftStem} scale={scale} delay={delay + step(0)} uid={`${uid}l`} />
      <Stem part={PARTS.rightStem} scale={scale} delay={delay + step(1)} uid={`${uid}r`} />
      <Ribbon part={PARTS.ribbon} scale={scale} delay={delay + step(2)} uid={`${uid}b`} />
      <Arm part={PARTS.arm} scale={scale} delay={delay + step(6)} uid={`${uid}a`} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
