import Link from "next/link";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import type { NavItem } from "./nav-items";
import styles from "./profile.module.css";

// The page's one bar (Charlotte v2 hi-fi: fixed header with the shelter's mark, a hairline
// rule, the cat's name once the hero has scrolled past, and the section links). It carries no adoption pill and no
// progress bar — the spec keeps the page to what the volunteer wrote and a way back.

export interface NavProps {
  name: string;
  items: readonly NavItem[];
}

/**
 * A sticky header: the mark linking back to `/cats`, the cat's name (revealed by
 * scroll where scroll-driven animation exists, plain otherwise) and, when there are
 * sections to link, a `Sections` navigation of in-page anchors, each a 44px pill.
 */
export function Nav({ name, items }: NavProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerBar}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <div className={styles.headerLead}>
            <Link href="/cats" className={styles.wordmark}>
              <Logo height={LOGO_HEIGHT.nav} alt="South County Cats" />
            </Link>
            <span className={styles.headerName} aria-hidden="true">
              {name}
            </span>
          </div>
          {items.length === 0 ? null : (
            <nav aria-label="Sections" className={styles.nav}>
              {items.map((item) => (
                <a key={item.href} href={item.href} className={styles.navLink}>
                  {item.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
