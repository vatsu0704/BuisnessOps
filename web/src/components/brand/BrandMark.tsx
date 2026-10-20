import { useId, type CSSProperties } from 'react';
import art from '@shared/constants/brandMark.json';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import styles from './BrandMark.module.css';

/**
 * The KitnaPay mark, drawn from the mobile app's `brandMark.json` — the one
 * drawing of it, which also renders the launcher icon and the favicon — so the
 * logo on the web cannot drift from the logo on the phone.
 *
 * It draws itself the way the app's does, and for the same reason: the artwork
 * is a still image, so the motion is read off the only cue in it — the speed
 * lines. A speed line is a wake, so the letters land first and the streaks whip
 * out backwards from under the K, each growing from the end the stem covers so
 * that end never moves. Each part is its own layer and every step is a transform
 * or an opacity, so it runs on the compositor.
 *
 * `prefers-reduced-motion` shows it finished. That was claimed here before it
 * was true — the rule did not exist — so it is now a media query in the
 * stylesheet rather than a sentence in a comment.
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
type PartName = 'speedLine1' | 'speedLine2' | 'speedLine3' | 'speedLine4' | 'kLetter' | 'pLetter';

const PAINTS: Record<string, Paint> = art.paints;
const PARTS: Record<PartName, Part> = art.parts;

export function markHeight(width: number): number {
  return (width * art.height) / art.width;
}

/**
 * One part, drawn into exactly its own box. Gradient ids are made unique with
 * `uid`: every SVG on a web page shares one id namespace, and `url(#id)` resolves
 * to the first match anywhere in the document.
 */
function PartArt({ part, scale, uid }: { part: Part; scale: number; uid: string }) {
  const [x, y, w, h] = part.box;
  const paints = [...new Set(part.paths.flatMap((p) => (p.paint ? [p.paint] : [])))];

  return (
    <svg width={w * scale} height={h * scale} viewBox={`${x} ${y} ${w} ${h}`} focusable="false">
      <defs>
        {paints.map((name) => {
          const paint = PAINTS[name];
          return (
            <linearGradient
              key={name}
              id={`${uid}-${name}`}
              x1={paint.x1}
              y1={paint.y1}
              x2={paint.x2}
              y2={paint.y2}
              gradientUnits={paint.userSpace ? 'userSpaceOnUse' : 'objectBoundingBox'}
            >
              {paint.stops.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          );
        })}
      </defs>
      {part.paths.map((path, index) => (
        <path key={index} d={path.d} fill={path.paint ? `url(#${uid}-${path.paint})` : art.navy} />
      ))}
    </svg>
  );
}

/**
 * Listed in paint order — the K has to cover the end of every line — and timed
 * the other way round, because a wake follows what made it.
 */
const LAYERS: { name: PartName; motion: 'streak' | 'letter' | 'grow'; order: number }[] = [
  { name: 'speedLine1', motion: 'streak', order: 2 },
  { name: 'speedLine2', motion: 'streak', order: 2.5 },
  { name: 'speedLine3', motion: 'streak', order: 3 },
  { name: 'speedLine4', motion: 'streak', order: 3.5 },
  { name: 'kLetter', motion: 'letter', order: 0 },
  { name: 'pLetter', motion: 'grow', order: 1 },
];

type Props = {
  width?: number;
  delay?: number;
  /** false shows the mark finished, with no draw-in. */
  animate?: boolean;
  className?: string;
};

export default function BrandMark({ width = 44, delay = 0, animate = true, className }: Props) {
  const scale = width / art.width;
  // useId's punctuation is not valid inside a url(#…) reference.
  const uid = `brandMark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <span
      className={cx(styles.mark, !animate && styles.still, className)}
      style={{ width, height: markHeight(width), '--delay': `${delay}ms` } as CSSProperties}
      aria-hidden="true"
    >
      {LAYERS.map(({ name, motion, order }) => {
        const part = PARTS[name];
        const [x, y, w, h] = part.box;
        return (
          <span
            key={name}
            className={cx(styles.layer, styles[motion])}
            style={
              {
                left: x * scale,
                top: y * scale,
                width: w * scale,
                height: h * scale,
                '--layer-delay': `${delay + step(order)}ms`,
                // How far the K comes in from. A streak needs none: it grows
                // along its own length from the end the stem covers.
                '--travel': `${w * 0.42 * scale}px`,
              } as CSSProperties
            }
          >
            <PartArt part={part} scale={scale} uid={`${uid}${name}`} />
          </span>
        );
      })}
    </span>
  );
}
