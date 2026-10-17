import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import styles from './QrCode.module.css';

/**
 * A QR code, drawn as one SVG path — the app's `QrCode`, with the same encoder
 * (`qrcode-generator`, plain JavaScript) and the same rules: error correction M,
 * a four-module quiet zone, black on white whatever the page's colours, because
 * a scanner reads contrast and a tinted code fails on cheap phones.
 *
 * Each dark run in a row is one rectangle, so a full code is a few hundred path
 * commands rather than a few thousand squares, and `crispEdges` keeps the
 * module edges sharp at any size the card gives it.
 */
const QUIET_ZONE = 4;

export default function QrCode({ value, label }: { value: string; label: string }) {
  const { path, extent } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      let col = 0;
      while (col < count) {
        if (!qr.isDark(row, col)) {
          col += 1;
          continue;
        }
        const start = col;
        while (col < count && qr.isDark(row, col)) col += 1;
        d += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`;
      }
    }
    return { path: d, extent: count + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={extent} height={extent} fill="#FFFFFF" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
