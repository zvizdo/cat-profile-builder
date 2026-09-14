import type { ReactNode } from "react";
import styles from "./carousel.module.css";
import { EMPTY } from "./strings";

// The empty rotation (FR-067; CONTENT.md → Event carousel → Empty rotation): the night
// ground and three sentences — never a blank, a broken frame or a spinner.

/** What `/carousel` shows when no cat is live; `children` is the kiosk's offline note, if any. */
export function EmptyRotation({ children }: { children?: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>{EMPTY.title}</h1>
        <p className={styles.emptyLine}>{EMPTY.line}</p>
        <p className={styles.emptyDetail}>{EMPTY.detail}</p>
        {children}
      </div>
    </main>
  );
}
