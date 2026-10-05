import { useMemo } from 'react';
import { PixelRatio, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';

type Props = {
  /** What the code says — a `upi://pay` link, here. */
  value: string;
  /**
   * The most room the square may take, in dp. The caller derives it from the
   * window width; the code is drawn at the largest whole-pixel module size that
   * fits inside it, so it may come out a few dp smaller.
   */
  size: number;
  testID?: string;
  accessibilityLabel?: string;
};

/**
 * The quiet zone around a QR code, in modules. Four is what the standard asks
 * for, and a scanner that cannot find the edge of the code reads nothing — so
 * it is part of the code, not decoration the layout may trim.
 */
const QUIET_ZONE = 4;

/**
 * Always black on white, whatever the theme. A scanner looks for dark modules
 * on a light ground; a dark grey that reads fine as body text is measurably
 * harder for a phone camera to binarise, and a "branded" QR is a QR that fails
 * on somebody's phone. So these are not theme tokens on purpose.
 */
const QR_INK = '#000000';
const QR_GROUND = '#FFFFFF';

/**
 * A QR code, drawn with react-native-svg (requirement 26).
 *
 * The encoding is `qrcode-generator` — pure JavaScript with no dependencies of
 * its own, because React Native has no QR encoder and the drawing is better
 * done here than by a second library that would bring its own renderer.
 *
 * The dark modules become ONE path, run by run along each row, rather than a
 * rectangle per module: a payment link is a 41×41 code, and 1,681 SVG nodes is
 * a lot to lay out on a mid-range phone for something that never changes.
 *
 * Each module is a whole number of PHYSICAL pixels (`PixelRatio`). At a
 * fractional size, two neighbouring runs each antialias the edge they share and
 * leave a faint light seam between rows — harmless to the eye, and on a busy
 * code sometimes enough to stop a camera reading it. On whole pixels every edge
 * falls on a pixel boundary and there is nothing to antialias.
 *
 * Error correction `M` (15%) is the usual choice for a code shown on a screen:
 * it survives glare and a scratched protector without making the code so dense
 * that a cheap camera at arm's length cannot resolve it.
 */
export default function QrCode({ value, size, testID, accessibilityLabel }: Props) {
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

  const ratio = PixelRatio.get();
  const moduleSize = Math.max(1, Math.floor((size / extent) * ratio)) / ratio;
  const drawn = moduleSize * extent;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ width: drawn, height: drawn }}
    >
      <Svg width={drawn} height={drawn} viewBox={`0 0 ${extent} ${extent}`}>
        <Rect x={0} y={0} width={extent} height={extent} fill={QR_GROUND} />
        <Path d={path} fill={QR_INK} />
      </Svg>
    </View>
  );
}
