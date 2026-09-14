import type { Block, MediaId, ProfileDocument, ResolvedMedia } from "@/core/profile/schema";
import { displayLine } from "@/core/profile/display-line";
import { themeStyle } from "@/ui/builder/theme-css";
import { Bio } from "./blocks/Bio";
import { Day } from "./blocks/Day";
import { Gallery } from "./blocks/Gallery";
import { Hero } from "./blocks/Hero";
import { Needs } from "./blocks/Needs";
import { Photo } from "./blocks/Photo";
import { Quote } from "./blocks/Quote";
import { Video } from "./blocks/Video";
import { Facts } from "./Facts";
import { Nav } from "./Nav";
import { navItems, sectionId } from "./nav-items";
import styles from "./profile.module.css";
import { ScrollProgress } from "./ScrollProgress";
import { sectionStrings } from "./strings";

// The published page (T028; constitution I: document and manifest in, React out). One
// component serves `/cats/{slug}-{id}`, `/builder/{id}/preview` and phone mode: the
// hero, the facts strip, then every other block in the volunteer's order. Nothing else —
// no footer, no "updated", no call to action (spec Clarifications 2026-09-10).

export interface ProfilePageProps {
  /** The published copy, or the draft for the preview — the renderers read only the shared fields. */
  document: ProfileDocument;
  /** The publish manifest, or the preview's; an id with no entry draws a striped slot. */
  media: Record<MediaId, ResolvedMedia>;
  /**
   * Drawn inside another page's `main` (phone mode's canvas): the page's own content
   * root is a plain `div`, so the document keeps one main landmark.
   */
  embedded?: boolean;
}

/** The entry for a single-slot block, or `undefined` while the slot is empty or unresolved. */
function entryOf(media: Record<MediaId, ResolvedMedia>, mediaId: MediaId | null) {
  return mediaId === null ? undefined : media[mediaId];
}

interface BlockViewProps extends ProfilePageProps {
  block: Block;
  /** The display line, handed to the page's first bio as its head. */
  line: string;
}

/** One block as its renderer; the hero is drawn by the page itself. */
function BlockView({ block, document, media, line }: BlockViewProps) {
  const strings = sectionStrings(document.sex);
  const id = sectionId(document.blocks, block.id);
  switch (block.type) {
    case "hero":
      return null;
    case "bio": {
      const first = document.blocks.find((candidate) => candidate.type === "bio");
      return (
        <Bio block={block} strings={strings} id={id} lead={block === first ? line : undefined} />
      );
    }
    case "photo":
      return <Photo block={block} media={entryOf(media, block.mediaId)} />;
    case "gallery":
      return <Gallery block={block} media={media} id={id} />;
    case "video":
      return <Video media={entryOf(media, block.mediaId)} id={id} />;
    case "day":
      return <Day block={block} media={media} strings={strings} id={id} />;
    case "needs":
      return <Needs block={block} strings={strings} id={id} />;
    case "quote":
      return <Quote block={block} media={entryOf(media, block.mediaId)} />;
  }
}

/**
 * The page: theme on the root as the four `--profile-*` properties, the header, then the
 * hero (F1: every document has exactly one, at `blocks[0]`), the facts, and the blocks —
 * in a `main`, or a `div` when `embedded` in one.
 */
export function ProfilePage({ document, media, embedded = false }: ProfilePageProps) {
  const line = displayLine(document);
  const hero = document.blocks[0];
  const Content = embedded ? "div" : "main";
  return (
    <div className={styles.page} style={themeStyle(document.theme)}>
      <Nav name={document.name} items={navItems(document.blocks, document.sex)} />
      <Content>
        {hero?.type === "hero" ? (
          <Hero name={document.name} line={line} media={entryOf(media, hero.mediaId)} />
        ) : null}
        <Facts age={document.age} sex={document.sex} />
        {document.blocks.map((block, index) => (
          // Keyed by position: the list is static here, and a block id in a key would
          // reach the response as React's own metadata (FR-059). Position is also the
          // contract the builder's phone preview relies on (F34, `follow-target.ts`): every
          // block renders exactly one root `<section>` — the hero's above, block `i`'s as
          // the `i`th section child here — and nothing else here is a `section`, so a
          // block can be found without any id in the markup. ProfilePage.test.tsx counts
          // them; a renderer with any other root would put the follow one block off.
          <BlockView key={index} block={block} document={document} media={media} line={line} />
        ))}
      </Content>
      <ScrollProgress />
    </div>
  );
}
