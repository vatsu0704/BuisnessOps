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
 * The KitnaPay mark: four speed lines, a navy K and a coral P leaning into them.
 *
 * It is drawn from constants/brandMark.json, the same geometry that
 * scripts/generate-brand-assets.js renders into the launcher icon and the
 * splash, so the in-app logo and the icon cannot drift apart.
 *
 * ## How it moves, and why
 *
 * The artwork is a still image, so the animation has to be read out of it. The
 * only motion cue is the speed lines, and a speed line is a **wake**: it is what
 * a thing leaves behind, not what arrives before it. So the letters land first
 * and the streaks whip out backwards from under the K, top to bottom — about a
 * second end to end, once.
 *
 * Each streak grows along its own length from its right-hand end, which is the
 * end buried under the K's stem. It therefore appears to be drawn out from
 * behind the letter, and because that end never moves there is no moment where a
 * line and the stem are out of register. `brandMark.json` runs every line on
 * under the stem for exactly this.
 *
 * Each part is its own layer and every step is a transform or an opacity, so the
 * whole sequence runs on the UI thread.
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
type PartName = 'speedLine1' | 'speedLine2' | 'speedLine3' | 'speedLine4' | 'kLetter' | 'pLetter';
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
 * A speed line drawing itself out backwards from under the K.
 *
 * The scale pivots on the box's right edge — the end the stem covers — so the
 * line lengthens to the left and its buried end never moves. The spring's
 * overshoot is what makes it read as a whip rather than as a bar being extruded.
 */
function Streak({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
  }, [delay, progress]);

  const halfW = (part.box[2] * scale) / 2;
  const animatedStyle = useAnimatedStyle(() => ({
    // Fades in over the first half of the growth, so the shortest moment of a
    // line — a stub a few units long — is not a dot beside the letter.
    opacity: Math.min(1, progress.value * 2),
    transform: [{ translateX: halfW * (1 - progress.value) }, { scaleX: progress.value }],
  }));

  return (
    <Animated.View style={[layerStyle(part.box, scale), animatedStyle]}>
      <PartArt part={part} scale={scale} uid={uid} />
    </Animated.View>
  );
}

/** The K, arriving from the left at speed and settling. */
function Letter({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
  }, [delay, progress]);

  const travel = part.box[2] * scale * 0.42;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2.2),
    transform: [{ translateX: -(1 - progress.value) * travel }],
  }));

  return (
    <Animated.View style={[layerStyle(part.box, scale), animatedStyle]}>
      <PartArt part={part} scale={scale} uid={uid} />
    </Animated.View>
  );
}

/** The P, unfurling out of its lower-left corner, where it meets the K's arm. */
function Grow({ part, scale, delay, uid }: LayerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
  }, [delay, progress]);

  const halfW = (part.box[2] * scale) / 2;
  const halfH = (part.box[3] * scale) / 2;
  const animatedStyle = useAnimatedStyle(() => {
    const s = 0.55 + 0.45 * progress.value;
    // A scale pivots on the centre; shifting by the pivot's offset times (1 - s)
    // pins the lower-left corner instead.
    return {
      opacity: Math.min(1, progress.value * 2.4),
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

  // The lines are listed first because the K has to paint over the end of each
  // one; they move last because a wake follows what made it.
  return (
    <Animated.View style={[{ width, height: markHeight(width) }, animatedStyle]}>
      <Streak part={PARTS.speedLine1} scale={scale} delay={delay + step(2)} uid={`${uid}s1`} />
      <Streak part={PARTS.speedLine2} scale={scale} delay={delay + step(2.5)} uid={`${uid}s2`} />
      <Streak part={PARTS.speedLine3} scale={scale} delay={delay + step(3)} uid={`${uid}s3`} />
      <Streak part={PARTS.speedLine4} scale={scale} delay={delay + step(3.5)} uid={`${uid}s4`} />
      <Letter part={PARTS.kLetter} scale={scale} delay={delay + step(0)} uid={`${uid}k`} />
      <Grow part={PARTS.pLetter} scale={scale} delay={delay + step(1)} uid={`${uid}p`} />
    </Animated.View>
  );
}
