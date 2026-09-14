import type { CarouselCat, CarouselPhoto } from "@/core/carousel/roster";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import styles from "./carousel.module.css";
import { QrCard } from "./QrCard";
import { HEADER, UP_NEXT } from "./strings";

// One beat's content column (comp 6a; CONTENT.md → Event carousel): the header row, the
// rule / name / line / facts stack, and the bottom row with the next three cats, the media
// lines and the QR card. Pure — every animated element re-animates in place when the
// stage's parity flips, so nothing here remounts between beats.

/** How a cat's sex reads on the frame. */
const SEX = { female: "Female", male: "Male" } as const;

export interface BeatProps {
  cat: CarouselCat;
  /** `01 / 20`. */
  counter: string;
  upNext: readonly CarouselPhoto[];
  /** The ids the frame link is named by: the name and the line. */
  nameId: string;
  lineId: string;
}

function Top({ counter }: { counter: string }) {
  return (
    <div className={styles.top}>
      <div className={styles.brand}>
        <Logo
          height={LOGO_HEIGHT.carousel}
          tone="white"
          alt="South County Cats"
          className={styles.logo}
        />
        <div className={styles.divider} />
        <span className={`${styles.mono} ${styles.label}`}>{HEADER.label}</span>
      </div>
      <div className={styles.counterRow}>
        <span className={`${styles.mono} ${styles.counter}`}>{counter}</span>
        <div className={styles.ticks} aria-hidden="true">
          <div className={styles.tick}>
            <div className={styles.tickBar} />
          </div>
          <div className={styles.tick} />
          <div className={styles.tick} />
        </div>
      </div>
    </div>
  );
}

function Facts({ cat }: { cat: CarouselCat }) {
  const facts = [
    ...(cat.age === undefined ? [] : [{ label: "Age", value: cat.age }]),
    ...(cat.sex === undefined ? [] : [{ label: "Sex", value: SEX[cat.sex] }]),
  ];
  if (facts.length === 0) return null;
  return (
    <ul className={styles.facts}>
      {facts.map((fact) => (
        <li key={fact.label} className={styles.pill}>
          <span className={`${styles.mono} ${styles.pillLabel}`}>{fact.label}</span>
          <span className={styles.pillValue}>{fact.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** The column at the TV-safe inset: header, the cat, the footer. */
export function Beat({ cat, upNext, nameId, lineId, counter }: BeatProps) {
  return (
    <div className={styles.column}>
      <Top counter={counter} />
      <div className={styles.middle}>
        <div className={styles.stack}>
          <div className={styles.ruleRow}>
            <div className={styles.rule} />
          </div>
          <h1 id={nameId} className={styles.name}>
            {cat.name}
          </h1>
          <p id={lineId} className={styles.line}>
            {cat.line}
          </p>
          <Facts cat={cat} />
        </div>
      </div>
      <div className={styles.bottom}>
        {/* F55 item 8: one cat live means no next cat — the group stays (it keeps the
            QR card at the right of the row) but draws no label over nothing. */}
        <div className={styles.upNext}>
          {upNext.length === 0 ? null : (
            <>
              <span className={`${styles.mono} ${styles.upNextLabel}`}>{UP_NEXT}</span>
              <div className={styles.thumbs} aria-hidden="true">
                {upNext.map((photo, i) => (
                  <div
                    key={i}
                    className={styles.thumb}
                    data-thumb={i}
                    style={{
                      backgroundImage: `url("${photo.src}")`,
                      backgroundPosition: `${photo.focal.x}% ${photo.focal.y}%`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className={styles.footer}>
          <QrCard name={cat.name} url={cat.url} />
        </div>
      </div>
    </div>
  );
}
