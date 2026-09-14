"use client";
import { create } from "qrcode";
import { useMemo } from "react";
import styles from "./carousel.module.css";
import { qrPath } from "./qr-path";
import { QR } from "./strings";

// The scan-to-keep card (comp 6a; FR-088): the cat's public URL as an inline SVG QR at
// error-correction level H — a phone across a room, glare on the TV, a quarter of the
// symbol lost and it still resolves — beside the three CONTENT.md strings. Encoded on the
// client once per URL; the symbol is the same for every beat the cat gets.

export interface QrCardProps {
  name: string;
  /** The cat's full public URL, exactly what the QR resolves to. */
  url: string;
}

/**
 * The white card: a 240px SVG QR of `url` named `Scan — {name}'s page` for assistive
 * technology, then `Scan`, `{name}'s page` and the sentence.
 */
export function QrCard({ name, url }: QrCardProps) {
  const symbol = useMemo(() => {
    const { modules } = create(url, { errorCorrectionLevel: "H" });
    return { size: modules.size, path: qrPath(modules) };
  }, [url]);
  return (
    <div className={styles.card}>
      <svg
        className={styles.qr}
        role="img"
        aria-label={QR.alt(name)}
        viewBox={`0 0 ${symbol.size} ${symbol.size}`}
        shapeRendering="crispEdges"
      >
        <path d={symbol.path} />
      </svg>
      <div className={styles.cardText}>
        <span className={`${styles.mono} ${styles.cardLabel}`}>{QR.label}</span>
        <span className={styles.cardName}>{QR.page(name)}</span>
        <span className={styles.cardSentence}>{QR.sentence}</span>
      </div>
    </div>
  );
}
