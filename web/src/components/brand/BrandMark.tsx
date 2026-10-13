import { useId, type CSSProperties } from 'react';
import art from '@shared/constants/brandMark.json';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import styles from './BrandMark.module.css';

/**
 * The HisabKitab mark, drawn from the mobile app's `brandMark.json` — the one
 * drawing of it, which also renders the launcher icon and the favicon — so the
 * logo on the web cannot drift from the logo on the phone.
 *
 * It draws itself the way the app's does: the stems rise off the baseline, the
 * ribbon wipes across them left to right, then the arm flicks out. Each part is
 * its own layer and every step is a transform, an opacity or a clip, so it runs
 * on the compositor; `prefers-reduced-motion` shows it finished.
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
type PartName = 'leftStem' | 'rightStem' | 'ribbon' | 'arm';

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
        <path key={index} d={path.d} fill={path.paint ? `url(#${uid}-${path.paint})` : art.blue} />
      ))}
    </svg>
  );
}

const LAYERS: { name: PartName; motion: 'stem' | 'ribbon' | 'arm'; order: number }[] = [
  { name: 'leftStem', motion: 'stem', order: 0 },
  { name: 'rightStem', motion: 'stem', order: 1 },
  { name: 'ribbon', motion: 'ribbon', order: 2 },
  { name: 'arm', motion: 'arm', order: 6 },
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
                '--rise': `${h * scale * 0.18}px`,
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
