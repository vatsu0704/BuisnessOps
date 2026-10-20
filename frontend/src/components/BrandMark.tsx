import { useEffect, useId } from 'react';
import type { ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import art from '@/constants/brandMark.json';
import { spring, step } from '@/theme/motion';

/**
 * The KitnaPay mark: three speed lines, a navy K and a coral P leaning into them.
 *
 * It is drawn from constants/brandMark.json, the same geometry that
 * scripts/generate-brand-assets.js renders into the launcher icon and the
 * splash, so the in-app logo and the icon cannot drift apart.
 *
 * ## How it moves, and why
 *
 * The artwork is a still image, so the animation is read off the only motion
 * cue in it — the three speed lines. The mark arrives the way the lines say it
 * travels: they streak in from the left, longest first, the K rides in behind
 * them, and the P lands last, growing out of the point where it overlaps the
 * K's arm. About 1.2s end to end, once.
 *
 * Each line overshoots slightly and settles rather than stopping dead, which is
 * one spring instead of a streak-then-retract pair — fewer moving parts, and
 * nothing to get out of step when the stagger changes.
 *
 * Each part is its own layer and every step is a transform or an opacity, so
 * the whole sequence runs on the UI thread.
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
type PartName = 'speedLine1' | 'speedLine2' | 'speedLine3' | 'kLetter' | 'pLetter';
const PARTS: Record<PartName, Part> = art.parts;

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
        <Path key={index} d={path.d} fill={path.paint ? `url(#${uid}-${path.paint})` : art.navy} />
      ))}
    </Svg>
  );
}

type LayerProps = { part: Part; scale: number; delay: number; uid: string };

/**
 * A speed line arriving from the left.
 *
 * It travels in by its own length plus the room to its left, so a short line
 * and a long one both enter from off the mark rather than appearing mid-air,
 * and the spring's overshoot is what makes it read as speed rather than as a
 * bar sliding into a slot.
 */
function Streak({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
  }, [delay, progress]);

  const travel = (part.box[0] + part.box[2]) * scale;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2.4),
    transform: [{ translateX: -(1 - progress.value) * travel }],
  }));

  return (
    <Animated.View style={[layerStyle(part.box, scale), animatedStyle]}>
      <PartArt part={part} scale={scale} uid={uid} />
    </Animated.View>
  );
}

/** The K, riding in behind the lines and settling onto the baseline. */
function Letter({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [delay, progress]);

  const travel = part.box[2] * scale * 0.35;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.8),
    transform: [{ translateX: -(1 - progress.value) * travel }],
  }));

  return (
    <Animated.View style={[layerStyle(part.box, scale), animatedStyle]}>
      <PartArt part={part} scale={scale} uid={uid} />
    </Animated.View>
  );
}

/** The P, growing out of its lower-left corner, where it meets the K's arm. */
function Grow({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
  }, [delay, progress]);

  const halfW = (part.box[2] * scale) / 2;
  const halfH = (part.box[3] * scale) / 2;
  const animatedStyle = useAnimatedStyle(() => {
    const s = 0.4 + 0.6 * progress.value;
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
      {/* The longest line leads: the eye follows it in and the K arrives on it. */}
      <Streak part={PARTS.speedLine2} scale={scale} delay={delay + step(0)} uid={`${uid}s2`} />
      <Streak part={PARTS.speedLine1} scale={scale} delay={delay + step(1)} uid={`${uid}s1`} />
      <Streak part={PARTS.speedLine3} scale={scale} delay={delay + step(1.5)} uid={`${uid}s3`} />
      <Letter part={PARTS.kLetter} scale={scale} delay={delay + step(2)} uid={`${uid}k`} />
      <Grow part={PARTS.pLetter} scale={scale} delay={delay + step(5)} uid={`${uid}p`} />
    </Animated.View>
  );
}

