// The QR card's drawing rule (FR-088): the symbol's module matrix as one SVG path in
// module units, so the `<svg>`'s viewBox is the symbol and its CSS size decides the pixels
// per module — 240px over a 21–29 module symbol keeps every module above 4px on 1080p.

/** The slice of `qrcode`'s `QRCode.modules` this reads: the side length and the row-major bits. */
export interface Modules {
  size: number;
  data: ArrayLike<number>;
}

/** Path data drawing every dark module as a unit square, runs merged along each row. */
export function qrPath({ size, data }: Modules): string {
  let path = "";
  for (let row = 0; row < size; row++) {
    let run = 0;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && data[row * size + col] !== 0;
      if (dark) {
        run++;
      } else if (run > 0) {
        path += `M${col - run} ${row}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  return path;
}
