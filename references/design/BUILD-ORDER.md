# Build order

Suggested phasing, with the acceptance criteria that matter for each. Ordered so the shelter gets something usable early: a published profile is worth more than a perfect builder.

## Decisions needed before phase 3

These are product calls, not design ones. Nothing else blocks.

1. **Publish validation set** — a proposal is in `CONTENT.md`; confirm it.
2. **Two volunteers, one shared login.** Autosave plus a shared account makes collisions real. Design assumes last-write-wins with a warning when a cat is already open (string drafted in `CONTENT.md`); confirm or replace.
3. **Who writes alt text** — design assumes the volunteer, with a suggested draft they can accept or rewrite.
4. **Kiosk auth** — pairing code shown as daily-rotating and network-scoped. Confirm the real constraint.
5. **The guided interview** is undesigned. Either scope it as its own design pass or ship phase 3 without it (the builder works without it; the helper's proposal flow is separate and complete).

---

## Phase 1 — Public profile

Build `Charlotte Profile v2.dc.html` against hardcoded data. No CMS, no auth.

Done when: the page renders from a cat object; the facts strip reflows at every width with the fee cell last and blue; every scroll scene works with a mouse, a trackpad and a keyboard; `prefers-reduced-motion` gives the same composition with scenes at their end state; type never drops below the scale in `TOKENS.json`; text over photography sits at full opacity on a scrim.

Watch for: the hero portal is a 260svh scroll container with a sticky child — get that right before the other scenes, they're the same mechanism. If scroll-driven CSS animations aren't available, IntersectionObserver plus a scroll-progress value reproduces every effect; the intended ranges are written in each `animation-range`.

## Phase 2 — Data, list, auth

Cat model, media storage with focal points, the shared shelter account, the profile list.

Done when: a cat can be created, edited via API, published and unpublished; the list filters live without a page load; drafts appear in the same grid as live cats; sign-in never reveals which half was wrong; sessions last 30 days.

The cat shape the designs assume:

```
Cat { id, slug, name, status: 'draft'|'live',
      age, sex, coat, goodWith, fee,
      tagline, bio: Paragraph[], traits: string[],
      blocks: Block[], updatedAt, updatedBy: 'volunteer' }

Block { id, kind: 'hero'|'bio'|'photo'|'gallery'|'video'|'facts', order, mediaIds[], text? }

Media { id, kind: 'photo'|'video', url, width, height,
        focal: { x: 0-100, y: 0-100 },   // percentages, required
        alt,                              // required before publish
        trim?: { in, out } }              // seconds, video only
```

`focal` is not optional. Every crop in the product derives from it (`background-position: x% y%` against `cover`). Without it, photos are blind centre-cropped and the whole design looks careless.

## Phase 3 — Builder

Block canvas, selection, reorder, themes, media library, focal-point picker, upload rules, toasts and modals, helper shell with the proposal flow.

Done when: exactly one block is selected at a time and it's the only blue outline on screen; reorder works by drag *and* by explicit up/down for keyboard and touch; the focal picker updates every derived crop live; an upload never partially applies; every destructive action names what it removes before the button; the helper proposes and applies as one atomic, once-undoable operation, and is inert with an explanation until one photo exists; publish explains what's missing and scrolls to the first gap instead of disabling itself.

Layout: 250px rail / canvas / 360px helper at ≥1440; helper docks to a 52px tab and opens as an overlay from 1180; touch layout with 44px pill actions from 1024; read-only preview below that. All four are drawn in sections 7b/7c.

## Phase 4 — Event carousel

The kiosk loop. This is the piece most likely to be built twice, so read the motion spec before starting: `Cat Carousel Motion.dc.html` plus the beat table in the README.

Done when: the six-slat wipe reassembles into one photograph with no visible seams (use `background-size: 600% auto` with `background-position-x` at 0/20/40/60/80/100% — hardcoded pixel metrics tear); the outgoing photo keeps its size and position through the wipe (same box as the drifting layer, holding the previous beat's ending transform); drift duration equals the beat exactly; a cat shows a different photo each loop; clips play muted, trimmed, and never cut mid-clip; nothing on the carousel is below 24px at 1080p; the QR resolves to the right cat; the last good rotation is cached so a dropped connection never blanks the screen; `prefers-reduced-motion` holds the composition still and pages by arrow key.

## Phase 5 — Carousel set-up, then the gaps

Rotation, timing, cast. Then the undesigned pieces in priority order: the guided interview, the public all-cats index, keyboard/screen-reader specs for the block canvas, print pieces (cage card, QR flier).

Set-up done when: only published cats can enter the rotation; pulling a cat's profile back to draft removes it from the carousel without anyone touching the TV; the loop re-times immediately; the empty rotation shows its own state rather than composing a slide from nothing; pluralisation is right at one cat.

---

## Accessibility, all phases

- Contrast pairs in `TOKENS.json` are the shipped set. `#8A857E` is hairlines only — never text.
- Every icon in the tools carries a label; the carousel uses no icons.
- Touch targets ≥44px, including block actions.
- Alt text required before publish.
- `prefers-reduced-motion` is a first-class path, not a fallback: same layout, order and copy.
- Focus order on the block canvas and announcements for reorder still need specifying — flag it rather than guessing.
