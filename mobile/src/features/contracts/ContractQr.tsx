import QRCode from "qrcode";
import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";

/** The quiet border a QR code needs around it, in modules. */
const MARGIN = 2;

/**
 * A QR code of some text (a contract's link, for the front desk: docs/DECISIONS.md §34), black on white in light and
 * dark, drawn with SVG from `qrcode`'s modules (pure JavaScript: nothing native).
 */
export function QrCode({ value, size, testID }: { value: string; size: number; testID?: string }) {
  const { d, n } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    let path = "";
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.modules.data[y * count + x]) path += `M${x} ${y}h1v1h-1z`;
    return { d: path, n: count };
  }, [value]);
  const box = n + 2 * MARGIN;
  return (
    <Svg width={size} height={size} viewBox={`${-MARGIN} ${-MARGIN} ${box} ${box}`} accessibilityLabel="QR code" testID={testID}>
      <Rect x={-MARGIN} y={-MARGIN} width={box} height={box} fill="#ffffff" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
}
